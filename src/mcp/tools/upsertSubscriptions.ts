import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { NewsRepository } from "../../store/repository.js"

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
    message: "feedUrl must be a valid URL or rsshub:// route",
  },
)

const upsertSubscriptionsInput = z.object({
  items: z
    .array(
      z.object({
        feedUrl: feedUrlInput,
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
    "Create or update RSS subscriptions and return canonical feedUrls. Known RSSHub instance URLs are stored as rsshub://....",
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
