import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { AppConfig } from "../../config.js"
import { fetchRssFeed } from "../../rss/fetcher.js"
import { normalizeFeedItems } from "../../rss/normalize.js"
import type { NewsRepository } from "../../store/repository.js"
import { resolveToolFeedUrls } from "./shared.js"

const syncNewsInput = z.object({
  feedUrls: z.array(z.string().url()).max(500).optional(),
})

type FeedSyncResult = {
  feedUrl: string
  status: "success" | "not_modified" | "error"
  fetched: number
  inserted: number
  message?: string
}

export function registerSyncNewsTool(server: McpServer, deps: {
  repository: NewsRepository
  config: AppConfig
}) {
  server.tool(
    "sync_news",
    "Fetch subscribed RSS feeds and update stored entries.",
    syncNewsInput.shape,
    async (input) => {
      const debugLog = (event: string, detail?: unknown) => {
        if (!deps.config.debugEnabled) return
        console.log(
          `[rss-mcp-debug] ${event}`,
          detail === undefined ? "" : JSON.stringify(detail, null, 2),
        )
      }

      const resolvedFeedUrls = resolveToolFeedUrls({
        repository: deps.repository,
        config: deps.config,
        feedUrls: input.feedUrls,
      })

      const results = await Promise.all(
        resolvedFeedUrls.map(async (feedUrl): Promise<FeedSyncResult> => {
          const now = Date.now()
          try {
            const previousState = deps.repository.getFeedState(feedUrl)
            const result = await fetchRssFeed({
              feedUrl,
              previousState: previousState
                ? {
                    etag: previousState.etag,
                    lastModified: previousState.lastModified,
                  }
                : null,
              timeoutMs: deps.config.requestTimeoutMs,
              userAgent: deps.config.userAgent,
              debugResponsePreviewLength: deps.config.debugResponsePreviewLength,
              onDebug: debugLog,
            })

            deps.repository.upsertFeedState({
              feedUrl,
              etag: result.etag,
              lastModified: result.lastModified,
              lastCheckedAt: now,
            })

            if (result.status === "not_modified") {
              return {
                feedUrl,
                status: "not_modified",
                fetched: 0,
                inserted: 0,
              }
            }

            const normalizedEntries = normalizeFeedItems(feedUrl, result.items)
            const inserted = deps.repository.upsertEntries(feedUrl, normalizedEntries)
            return {
              feedUrl,
              status: "success",
              fetched: normalizedEntries.length,
              inserted,
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            debugLog("rss.feed.error", { feedUrl, error: message })
            return {
              feedUrl,
              status: "error",
              fetched: 0,
              inserted: 0,
              message,
            }
          }
        }),
      )

      const summary = results.reduce(
        (acc, item) => {
          acc.fetchedTotal += item.fetched
          acc.insertedTotal += item.inserted
          if (item.status === "not_modified") acc.skipped304Feeds += 1
          if (item.status === "error") {
            acc.errorFeeds += 1
          } else {
            acc.successFeeds += 1
          }
          return acc
        },
        {
          feedsTotal: resolvedFeedUrls.length,
          successFeeds: 0,
          errorFeeds: 0,
          fetchedTotal: 0,
          insertedTotal: 0,
          skipped304Feeds: 0,
        },
      )

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                resolvedFeedUrls,
                summary,
                results,
                updatedAt: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      }
    },
  )
}
