import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { NewsRepository } from "../../store/repository.js"

const upsertSubscriptionsInput = z.object({
  items: z
    .array(
      z.object({
        feedUrl: z.string().url(),
        title: z.string().trim().min(1).optional(),
        category: z.string().trim().min(1).optional(),
      }),
    )
    .min(1)
    .max(500),
})

export function registerUpsertSubscriptionsTool(
  server: McpServer,
  deps: { repository: NewsRepository },
) {
  server.tool(
    "upsert_subscriptions",
    "Create or update RSS subscriptions.",
    upsertSubscriptionsInput.shape,
    async (input) => {
      const result = deps.repository.upsertSubscriptions(input.items)

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      }
    },
  )
}
