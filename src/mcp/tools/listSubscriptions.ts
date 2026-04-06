import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { NewsRepository } from "../../store/repository.js"

const listSubscriptionsInput = z.object({
  category: z.string().min(1).optional(),
})

export function registerListSubscriptionsTool(
  server: McpServer,
  deps: { repository: NewsRepository },
) {
  server.tool(
    "list_subscriptions",
    "List subscribed RSS feeds and their current sync metadata.",
    listSubscriptionsInput.shape,
    async (input) => {
      const items = deps.repository.listSubscriptions({
        category: input.category,
      })

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                items: items.map((item) => ({
                  feedUrl: item.feedUrl,
                  title: item.title,
                  category: item.category,
                  lastCheckedAt: item.lastCheckedAt,
                  createdAt: item.createdAt,
                  updatedAt: item.updatedAt,
                })),
                category: input.category ?? null,
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
