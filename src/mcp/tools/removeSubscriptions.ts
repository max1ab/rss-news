import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { NewsRepository } from "../../store/repository.js"

const removeSubscriptionsInput = z.object({
  feedUrls: z.array(z.string().url()).min(1).max(500),
  mode: z.enum(["unsubscribe", "purge"]).optional(),
})

export function registerRemoveSubscriptionsTool(
  server: McpServer,
  deps: { repository: NewsRepository },
) {
  server.tool(
    "remove_subscriptions",
    "Remove RSS subscriptions, with optional purge of stored entries and read state.",
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
