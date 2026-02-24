import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { NewsRepository } from "../../store/repository.js"

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

const setReadStatusInput = z.object({
  startDate: z.string().regex(isoDatePattern),
  endDate: z.string().regex(isoDatePattern),
  status: z.enum(["read", "unread"]),
  feedUrls: z.array(z.string().url()).optional(),
})

function toDayStartTimestamp(date: string) {
  return Date.parse(`${date}T00:00:00.000Z`)
}

export function registerSetReadStatusByTimeRangeTool(
  server: McpServer,
  deps: { repository: NewsRepository },
) {
  server.tool(
    "set_read_status_by_time_range",
    "Set read/unread status for entries within a date range.",
    setReadStatusInput.shape,
    async (input) => {
      const startTimestamp = toDayStartTimestamp(input.startDate)
      const endExclusiveTimestamp = toDayStartTimestamp(input.endDate) + 24 * 60 * 60 * 1000

      if (Number.isNaN(startTimestamp) || Number.isNaN(endExclusiveTimestamp)) {
        throw new Error("Invalid startDate/endDate. Use YYYY-MM-DD.")
      }
      if (startTimestamp >= endExclusiveTimestamp) {
        throw new Error("startDate must be earlier than or equal to endDate.")
      }

      const result = deps.repository.setReadStatusByTimeRange({
        startTimestamp,
        endTimestamp: endExclusiveTimestamp,
        status: input.status,
        feedUrls: input.feedUrls,
      })

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: input.status,
                startDate: input.startDate,
                endDate: input.endDate,
                feedUrls: input.feedUrls ?? null,
                matchedEntries: result.matchedEntries,
                changedDeliveries: result.changedDeliveries,
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
