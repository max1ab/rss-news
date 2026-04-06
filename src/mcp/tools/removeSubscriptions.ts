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
    message: "feedUrls must be valid URLs or rsshub:// routes",
  },
)

const removeSubscriptionsInput = z.object({
  feedUrls: z.array(feedUrlInput).min(1).max(500),
  mode: z.enum(["unsubscribe", "purge"]).optional(),
})

export function registerRemoveSubscriptionsTool(
  server: McpServer,
  deps: { repository: NewsRepository },
) {
  server.tool(
    "remove_subscriptions",
    "Remove RSS subscriptions, with optional purge of stored entries and read state. RSSHub subscriptions must be removed using their stored rsshub://... feedUrl.",
    removeSubscriptionsInput.shape,
    async (input) => {
      const mode = input.mode ?? "unsubscribe"
      const result = deps.repository.removeSubscriptions(input.feedUrls, mode)

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                mode,
                ...result,
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
