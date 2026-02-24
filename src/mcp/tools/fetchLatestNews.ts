import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { AppConfig } from "../../config.js"
import type { NewsRepository } from "../../store/repository.js"

const fetchLatestNewsInput = z.object({
  feedUrls: z.array(z.string().url()).max(500).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  sinceMinutes: z.number().int().min(1).max(60 * 24 * 30).optional(),
  includeDelivered: z.boolean().optional(),
})

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
      const requestedFeedUrls = input.feedUrls ?? deps.repository.listKnownFeedUrls()
      if (requestedFeedUrls.length > deps.config.maxFeedUrlsPerRequest) {
        throw new Error(
          `feedUrls exceed configured max: ${deps.config.maxFeedUrlsPerRequest}`,
        )
      }

      const includeDelivered = input.includeDelivered === true
      const totalLimit = input.limit ?? deps.config.defaultLimitPerFeed
      const sinceTimestamp =
        typeof input.sinceMinutes === "number"
          ? Date.now() - input.sinceMinutes * 60 * 1000
          : undefined

      const entries = deps.repository.listEntriesAcrossFeeds({
        feedUrls: requestedFeedUrls,
        limit: totalLimit,
        sinceTimestamp,
        includeDelivered,
      })

      if (!includeDelivered) {
        const deliveredByFeed = new Map<string, string[]>()
        for (const entry of entries) {
          const list = deliveredByFeed.get(entry.feedUrl)
          if (list) {
            list.push(entry.entryUid)
          } else {
            deliveredByFeed.set(entry.feedUrl, [entry.entryUid])
          }
        }

        for (const [feedUrl, entryUids] of deliveredByFeed) {
          deps.repository.markDelivered(feedUrl, entryUids, Date.now())
        }
      }

      const items = entries
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
                includeDelivered,
                resolvedFeedUrls: requestedFeedUrls,
                limit: totalLimit,
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
