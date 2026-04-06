import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { AppConfig } from "../../config.js"
import { fetchRssFeed, normalizeRssHubUrl } from "../../rss/fetcher.js"
import { normalizeFeedItems } from "../../rss/normalize.js"
import { formatDate } from "./shared.js"

const feedUrlInput = z.string().trim().refine(
  (value) => {
    if (value.startsWith("rsshub://")) return true
    try {
      new URL(value)
      return true
    } catch {
      return false
    }
  },
  {
    message: "feedUrls must be valid URLs or rsshub:// routes",
  },
)

const previewFeedInput = z.object({
  feedUrls: z.array(feedUrlInput).min(1).max(500),
  limit: z.number().int().min(1).max(20).optional(),
})

export function registerPreviewFeedTool(server: McpServer, deps: { config: AppConfig }) {
  server.tool(
    "preview_feed",
    "Preview one or more feed URLs without subscribing, for example to verify fetchability and content before subscribing. Known RSSHub instance URLs are normalized to rsshub://.... For example, RSSHub routes can be discovered at https://docs.rsshub.app/routes/.",
    previewFeedInput.shape,
    async (input) => {
      if (input.feedUrls.length > deps.config.maxFeedUrlsPerRequest) {
        throw new Error(`feedUrls exceed configured max: ${deps.config.maxFeedUrlsPerRequest}`)
      }

      const limit = input.limit ?? 5
      const results = await Promise.all(
        input.feedUrls.map(async (inputFeedUrl) => {
          const feedUrl = normalizeRssHubUrl(inputFeedUrl.trim())
          try {
            const result = await fetchRssFeed({
              feedUrl,
              previousState: null,
              timeoutMs: deps.config.requestTimeoutMs,
              userAgent: deps.config.userAgent,
              debugResponsePreviewLength: deps.config.debugResponsePreviewLength,
            })
            const items = normalizeFeedItems(feedUrl, result.items)
              .slice(0, limit)
              .map((entry) => ({
                title: entry.title,
                link: entry.link,
                publishedAt: formatDate(entry.publishedAt),
                contentSnippet: entry.contentSnippet,
              }))

            return {
              inputFeedUrl,
              feedUrl,
              ok: true,
              items,
              message: null,
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return {
              inputFeedUrl,
              feedUrl,
              ok: false,
              items: [],
              message,
            }
          }
        }),
      )

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                limit,
                results,
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
