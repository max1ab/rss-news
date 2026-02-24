import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import type { AppConfig } from "../config.js"
import { registerFetchLatestNewsTool } from "./tools/fetchLatestNews.js"
import { registerGetNewsCountTool } from "./tools/getNewsCount.js"
import { registerSetReadStatusByTimeRangeTool } from "./tools/setReadStatusByTimeRange.js"
import { NewsRepository } from "../store/repository.js"

export function createServer(config: AppConfig) {
  const server = new McpServer({
    name: "rss-mcp-incremental-server",
    version: "0.1.0",
  })

  const repository = new NewsRepository(config.dbPath)

  registerFetchLatestNewsTool(server, {
    repository,
    config,
  })
  registerGetNewsCountTool(server, {
    repository,
  })
  registerSetReadStatusByTimeRangeTool(server, {
    repository,
  })

  return { server, repository }
}
