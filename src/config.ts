import path from "node:path"
import { fileURLToPath } from "node:url"

export interface AppConfig {
  dbPath: string
  requestTimeoutMs: number
  defaultLimitPerFeed: number
  maxFeedUrlsPerRequest: number
  userAgent: string
  debugEnabled: boolean
  debugResponsePreviewLength: number
}

export function loadConfig(): AppConfig {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const projectRootDir = path.resolve(moduleDir, "..")
  return {
    dbPath:
      process.env.RSS_MCP_DB_PATH?.trim() ||
      path.join(projectRootDir, "data", "rss.sqlite"),
    requestTimeoutMs: Number(process.env.RSS_MCP_REQUEST_TIMEOUT_MS || 15000),
    defaultLimitPerFeed: Number(process.env.RSS_MCP_DEFAULT_LIMIT_PER_FEED || 20),
    maxFeedUrlsPerRequest: Number(process.env.RSS_MCP_MAX_FEEDS_PER_REQUEST || 50),
    userAgent:
      process.env.RSS_MCP_USER_AGENT?.trim() ||
      "rss-news/0.1 (+https://localhost; incremental-fetch)",
    debugEnabled: process.env.RSS_MCP_DEBUG === "1" || process.env.RSS_MCP_DEBUG === "true",
    debugResponsePreviewLength: Number(process.env.RSS_MCP_DEBUG_PREVIEW_LENGTH || 300),
  }
}
