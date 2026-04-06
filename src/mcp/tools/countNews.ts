import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { AppConfig } from "../../config.js"
import type { NewsRepository } from "../../store/repository.js"
import { resolveToolFeedUrls } from "./shared.js"

const countNewsInput = z.object({
  feedUrls: z.array(z.string().url()).max(500).optional(),
  category: z.string().trim().min(1).optional(),
  pastHours: z.number().int().min(1).max(24 * 365),
  includeConsumed: z.boolean().optional(),
})

export function registerCountNewsTool(server: McpServer, deps: {
  repository: NewsRepository
  config: AppConfig
}) {
  server.tool(
    "count_news",
    "Count recent news items across subscribed feeds.",
    countNewsInput.shape,
    async (input) => {
      const resolvedFeedUrls = resolveToolFeedUrls({
        repository: deps.repository,
        config: deps.config,
        feedUrls: input.feedUrls,
        category: input.category,
      })
      const includeConsumed = input.includeConsumed === true
      const sinceTimestamp = Date.now() - input.pastHours * 60 * 60 * 1000
      const result = deps.repository.countNewsSince({
        sinceTimestamp,
        includeDelivered: includeConsumed,
        feedUrls: resolvedFeedUrls,
      })

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                pastHours: input.pastHours,
                includeConsumed,
                resolvedFeedUrls,
                category: input.category ?? null,
                totalCount: result.total,
                countsByFeed: result.byFeed,
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
