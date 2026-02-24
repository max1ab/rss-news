import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { NewsRepository } from "../../store/repository.js"

const getNewsCountInput = z.object({
  pastHours: z.number().int().min(1).max(24 * 365),
  includeDelivered: z.boolean().optional(),
  feedUrls: z.array(z.string().url()).optional(),
})

export function registerGetNewsCountTool(server: McpServer, deps: { repository: NewsRepository }) {
  server.tool(
    "get_news_count",
    "Get count of recent undelivered news or all news.",
    getNewsCountInput.shape,
    async (input) => {
      const includeDelivered = input.includeDelivered === true
      const sinceTimestamp = Date.now() - input.pastHours * 60 * 60 * 1000

      const countResult = deps.repository.countNewsSince({
        sinceTimestamp,
        includeDelivered,
        feedUrls: input.feedUrls,
      })

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                pastHours: input.pastHours,
                includeDelivered,
                countType: includeDelivered ? "all" : "undelivered",
                totalCount: countResult.total,
                countsByFeed: countResult.byFeed,
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
