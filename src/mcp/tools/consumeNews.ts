import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { AppConfig } from "../../config.js"
import type { NewsRepository } from "../../store/repository.js"
import { mapEntryForTool, resolveToolFeedUrls } from "./shared.js"

const consumeNewsInput = z.object({
  feedUrls: z.array(z.string().url()).max(500).optional(),
  category: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  sinceMinutes: z.number().int().min(1).max(60 * 24 * 30).optional(),
  includeConsumed: z.boolean().optional(),
})

export function registerConsumeNewsTool(server: McpServer, deps: {
  repository: NewsRepository
  config: AppConfig
}) {
  server.tool(
    "consume_news",
    "Read the latest news and mark unread items as consumed.",
    consumeNewsInput.shape,
    async (input) => {
      const resolvedFeedUrls = resolveToolFeedUrls({
        repository: deps.repository,
        config: deps.config,
        feedUrls: input.feedUrls,
        category: input.category,
      })
      const includeConsumed = input.includeConsumed === true
      const sinceTimestamp =
        typeof input.sinceMinutes === "number"
          ? Date.now() - input.sinceMinutes * 60 * 1000
          : undefined
      const limit = input.limit ?? deps.config.defaultFetchLimit
      const entries = deps.repository.listEntriesAcrossFeeds({
        feedUrls: resolvedFeedUrls,
        limit,
        sinceTimestamp,
        includeDelivered: includeConsumed,
      })

      let consumedCount = 0
      const unreadByFeed = new Map<string, string[]>()
      for (const entry of entries) {
        if (entry.isDelivered) continue
        const list = unreadByFeed.get(entry.feedUrl)
        if (list) {
          list.push(entry.entryUid)
        } else {
          unreadByFeed.set(entry.feedUrl, [entry.entryUid])
        }
      }

      for (const [feedUrl, entryUids] of unreadByFeed) {
        consumedCount += deps.repository.markDelivered(feedUrl, entryUids, Date.now())
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                items: entries.map((entry) => ({
                  ...mapEntryForTool(entry),
                  isConsumed: true,
                })),
                resolvedFeedUrls,
                category: input.category ?? null,
                limit,
                includeConsumed,
                consumedCount,
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
