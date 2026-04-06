import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import type { AppConfig } from "../config.js"
import { NewsRepository } from "../store/repository.js"
import { registerConsumeNewsTool } from "./tools/consumeNews.js"
import { registerCountNewsTool } from "./tools/countNews.js"
import { registerFetchNewsTool } from "./tools/fetchNews.js"
import { registerListSubscriptionsTool } from "./tools/listSubscriptions.js"
import { registerRemoveSubscriptionsTool } from "./tools/removeSubscriptions.js"
import { registerSetConsumptionStatusTool } from "./tools/setConsumptionStatus.js"
import { registerSyncNewsTool } from "./tools/syncNews.js"
import { registerUpsertSubscriptionsTool } from "./tools/upsertSubscriptions.js"

export function createServer(config: AppConfig) {
  const server = new McpServer({
    name: "rss-news",
    version: "0.1.0",
  })

  const repository = new NewsRepository(config.dbPath)

  registerListSubscriptionsTool(server, { repository })
  registerUpsertSubscriptionsTool(server, { repository })
  registerRemoveSubscriptionsTool(server, { repository })
  registerSyncNewsTool(server, { repository, config })
  registerFetchNewsTool(server, { repository, config })
  registerConsumeNewsTool(server, { repository, config })
  registerCountNewsTool(server, { repository, config })
  registerSetConsumptionStatusTool(server, { repository, config })

  return { server, repository }
}
