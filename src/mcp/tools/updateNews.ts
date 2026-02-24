import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { AppConfig } from "../../config.js"
import { fetchRssFeed } from "../../rss/fetcher.js"
import { normalizeFeedItems } from "../../rss/normalize.js"
import type { NewsRepository } from "../../store/repository.js"

const updateNewsInput = z.object({
  feedUrls: z.array(z.string().url()).max(500).optional(),
})

type FeedUpdateResult = {
  feedUrl: string
  fetched: number
  inserted: number
  skipped304: boolean
  error?: string
}

export function registerUpdateNewsTool(server: McpServer, deps: {
  repository: NewsRepository
  config: AppConfig
}) {
  server.tool(
    "update_news",
    "Fetch RSS feeds and update entries in storage.",
    updateNewsInput.shape,
    async (input) => {
      const debugLog = (event: string, detail?: unknown) => {
        if (!deps.config.debugEnabled) return
        console.log(
          `[rss-mcp-debug] ${event}`,
          detail === undefined ? "" : JSON.stringify(detail, null, 2),
        )
      }

      const requestedFeedUrls = input.feedUrls ?? deps.repository.listKnownFeedUrls()
      if (requestedFeedUrls.length > deps.config.maxFeedUrlsPerRequest) {
        throw new Error(
          `feedUrls exceed configured max: ${deps.config.maxFeedUrlsPerRequest}`,
        )
      }

      const perFeedResults = await Promise.all(
        requestedFeedUrls.map(async (feedUrl): Promise<FeedUpdateResult> => {
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
                fetched: 0,
                inserted: 0,
                skipped304: true,
              }
            }

            const normalizedEntries = normalizeFeedItems(feedUrl, result.items)
            const inserted = deps.repository.upsertEntries(feedUrl, normalizedEntries)
            return {
              feedUrl,
              fetched: normalizedEntries.length,
              inserted,
              skipped304: false,
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            debugLog("rss.feed.error", { feedUrl, error: message })
            return {
              feedUrl,
              fetched: 0,
              inserted: 0,
              skipped304: false,
              error: message,
            }
          }
        }),
      )

      const summary = perFeedResults.reduce(
        (acc, item) => {
          acc.fetchedTotal += item.fetched
          acc.insertedTotal += item.inserted
          if (item.skipped304) acc.skipped304Feeds += 1
          if (item.error) {
            acc.errorFeeds += 1
          } else {
            acc.successFeeds += 1
          }
          return acc
        },
        {
          feedsTotal: requestedFeedUrls.length,
          successFeeds: 0,
          errorFeeds: 0,
          fetchedTotal: 0,
          insertedTotal: 0,
          skipped304Feeds: 0,
        },
      )

      const errors = perFeedResults
        .filter((item) => typeof item.error === "string")
        .map((item) => ({
          feedUrl: item.feedUrl,
          message: item.error as string,
        }))

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: true,
                resolvedFeedUrls: requestedFeedUrls,
                summary,
                errors,
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
