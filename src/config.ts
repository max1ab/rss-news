import os from "node:os"
import path from "node:path"

export interface AppConfig {
  dbPath: string
  requestTimeoutMs: number
  defaultFetchLimit: number
  maxFeedUrlsPerRequest: number
  userAgent: string
  debugEnabled: boolean
  debugResponsePreviewLength: number
}

function getDefaultDbPath() {
  const home = os.homedir()

  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim() || path.join(home, "AppData", "Roaming")
    return path.join(appData, "rss-news", "rss.sqlite")
  }

  return path.join(home, ".local", "share", "rss-news", "rss.sqlite")
}

export function loadConfig(): AppConfig {
  return {
    dbPath: process.env.RSS_MCP_DB_PATH?.trim() || getDefaultDbPath(),
    requestTimeoutMs: Number(process.env.RSS_MCP_REQUEST_TIMEOUT_MS || 15000),
    defaultFetchLimit: Number(process.env.RSS_MCP_DEFAULT_FETCH_LIMIT || 20),
    maxFeedUrlsPerRequest: Number(process.env.RSS_MCP_MAX_FEEDS_PER_REQUEST || 50),
    userAgent:
      process.env.RSS_MCP_USER_AGENT?.trim() ||
      "rss-news/0.1 (+https://localhost; incremental-fetch)",
    debugEnabled: process.env.RSS_MCP_DEBUG === "1" || process.env.RSS_MCP_DEBUG === "true",
    debugResponsePreviewLength: Number(process.env.RSS_MCP_DEBUG_PREVIEW_LENGTH || 300),
  }
}
