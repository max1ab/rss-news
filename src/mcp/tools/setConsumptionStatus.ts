import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { AppConfig } from "../../config.js"
import type { NewsRepository } from "../../store/repository.js"
import { resolveToolFeedUrls } from "./shared.js"

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

const setConsumptionStatusInput = z.object({
  feedUrls: z.array(z.string().url()).max(500).optional(),
  category: z.string().trim().min(1).optional(),
  startDate: z.string().regex(isoDatePattern),
  endDate: z.string().regex(isoDatePattern),
  status: z.enum(["consumed", "unconsumed"]),
})

function toDayStartTimestamp(date: string) {
  return Date.parse(`${date}T00:00:00.000Z`)
}

export function registerSetConsumptionStatusTool(server: McpServer, deps: {
  repository: NewsRepository
  config: AppConfig
}) {
  server.tool(
    "set_consumption_status",
    "Set consumed or unconsumed status for stored news within a UTC date range.",
    setConsumptionStatusInput.shape,
    async (input) => {
      const startTimestamp = toDayStartTimestamp(input.startDate)
      const endExclusiveTimestamp = toDayStartTimestamp(input.endDate) + 24 * 60 * 60 * 1000

      if (Number.isNaN(startTimestamp) || Number.isNaN(endExclusiveTimestamp)) {
        throw new Error("Invalid startDate/endDate. Use YYYY-MM-DD.")
      }
      if (startTimestamp >= endExclusiveTimestamp) {
        throw new Error("startDate must be earlier than or equal to endDate.")
      }

      const resolvedFeedUrls = resolveToolFeedUrls({
        repository: deps.repository,
        config: deps.config,
        feedUrls: input.feedUrls,
        category: input.category,
      })
      const result = deps.repository.setReadStatusByTimeRange({
        startTimestamp,
        endTimestamp: endExclusiveTimestamp,
        status: input.status === "consumed" ? "read" : "unread",
        feedUrls: resolvedFeedUrls,
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
                resolvedFeedUrls,
                category: input.category ?? null,
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
