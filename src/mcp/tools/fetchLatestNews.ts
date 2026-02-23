import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { AppConfig } from "../../config.js"
import { fetchRssFeed } from "../../rss/fetcher.js"
import { normalizeFeedItems } from "../../rss/normalize.js"
import type { NewsRepository } from "../../store/repository.js"

const fetchLatestNewsInput = z.object({
  feedUrls: z.array(z.string().url()).min(1).max(500),
  limitPerFeed: z.number().int().min(1).max(200).optional(),
  sinceMinutes: z.number().int().min(1).max(60 * 24 * 30).optional(),
})

type FeedMeta = {
  fetched: number
  inserted: number
  delivered: number
  skipped304: boolean
  response?: {
    url: string
    sourceUrl: string
    attemptedUrls: string[]
    status: number
    statusText: string
    contentType: string | null
    contentLength: string | null
    etag: string | null
    lastModified: string | null
    responsePreview: string | null
  }
  error?: string
}

export function registerFetchLatestNewsTool(server: McpServer, deps: {
  repository: NewsRepository
  config: AppConfig
}) {
  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return null
    return new Date(timestamp).toISOString().slice(0, 10)
  }

  server.tool(
    "fetch_latest_news",
    "Fetch latest undelivered RSS news items.",
    fetchLatestNewsInput.shape,
    async (input) => {
      const debugLog = (event: string, detail?: unknown) => {
        if (!deps.config.debugEnabled) return
        console.log(
          `[rss-mcp-debug] ${event}`,
          detail === undefined ? "" : JSON.stringify(detail, null, 2),
        )
      }

      if (input.feedUrls.length > deps.config.maxFeedUrlsPerRequest) {
        throw new Error(
          `feedUrls exceed configured max: ${deps.config.maxFeedUrlsPerRequest}`,
        )
      }

      const limitPerFeed = input.limitPerFeed ?? deps.config.defaultLimitPerFeed
      const sinceTimestamp =
        typeof input.sinceMinutes === "number"
          ? Date.now() - input.sinceMinutes * 60 * 1000
          : undefined

      const metaByFeed: Record<string, FeedMeta> = {}

      const perFeedResults = await Promise.all(
        input.feedUrls.map(async (feedUrl) => {
          const now = Date.now()
          const feedMeta: FeedMeta = {
            fetched: 0,
            inserted: 0,
            delivered: 0,
            skipped304: false,
          }
          metaByFeed[feedUrl] = feedMeta

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
            feedMeta.response = result.response

            deps.repository.upsertFeedState({
              feedUrl,
              etag: result.etag,
              lastModified: result.lastModified,
              lastCheckedAt: now,
            })

            if (result.status === "not_modified") {
              feedMeta.skipped304 = true
            } else {
              const normalizedEntries = normalizeFeedItems(feedUrl, result.items)
              feedMeta.fetched = normalizedEntries.length
              feedMeta.inserted = deps.repository.upsertEntries(feedUrl, normalizedEntries)
            }

            const undelivered = deps.repository.listUndeliveredEntries({
              feedUrl,
              limit: limitPerFeed,
              sinceTimestamp,
            })

            deps.repository.markDelivered(
              feedUrl,
              undelivered.map((entry) => entry.entryUid),
              Date.now(),
            )
            feedMeta.delivered = undelivered.length
            debugLog("rss.feed.result", {
              feedUrl,
              fetched: feedMeta.fetched,
              inserted: feedMeta.inserted,
              delivered: feedMeta.delivered,
              skipped304: feedMeta.skipped304,
            })

            return undelivered
          } catch (error) {
            feedMeta.error = error instanceof Error ? error.message : String(error)
            debugLog("rss.feed.error", {
              feedUrl,
              error: feedMeta.error,
            })
            return []
          }
        }),
      )

      const items = perFeedResults
        .flat()
        .sort((a, b) => {
          const aTime = a.publishedAt ?? a.firstSeenAt
          const bTime = b.publishedAt ?? b.firstSeenAt
          return bTime - aTime
        })
        .map((entry) => ({
          feedUrl: entry.feedUrl,
          title: entry.title,
          link: entry.link,
          publishedAt: formatDate(entry.publishedAt),
          firstSeenAt: formatDate(entry.firstSeenAt),
          contentSnippet: entry.contentSnippet,
        }))

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                items,
                meta: metaByFeed,
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
