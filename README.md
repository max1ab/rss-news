# RSS MCP Incremental Server

Node.js + TypeScript MCP server for RSS news ingestion with incremental delivery.

## Features

- Fetch RSS/Atom feeds with conditional requests (`ETag` / `Last-Modified`)
- Support `rsshub://` protocol with automatic instance fallback
- Persist feed state and entries in SQLite
- Return only undelivered items to the agent
- Deduplicate entries using a stable `entry_uid`

## Quick Start

```bash
npm install
npm run build
npm start
```

Development:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

## Environment Variables

- `RSS_MCP_DB_PATH`: SQLite path (default: `./data/rss-mcp.sqlite`)
- `RSS_MCP_REQUEST_TIMEOUT_MS`: fetch timeout in milliseconds (default: `15000`)
- `RSS_MCP_DEFAULT_LIMIT_PER_FEED`: default return limit per feed (default: `20`)
- `RSS_MCP_MAX_FEEDS_PER_REQUEST`: max feed count for each call (default: `50`)
- `RSS_MCP_USER_AGENT`: custom request User-Agent
- `RSS_MCP_DEBUG`: set `1` or `true` to enable debug logs
- `RSS_MCP_DEBUG_PREVIEW_LENGTH`: preview length of response body for debug (default: `300`)

## MCP Tool

### `fetch_latest_news`

Input:

```json
{
  "feedUrls": ["https://example.com/rss.xml", "rsshub://deeplearning/the-batch"],
  "limitPerFeed": 20,
  "sinceMinutes": 120
}
```

Output:

- `items`: undelivered news sorted by latest timestamp
- `meta`: per-feed fetch stats (`fetched`, `inserted`, `delivered`, `skipped304`, `error`)
  - `meta[feedUrl].response.attemptedUrls` shows fallback attempts for `rsshub://` feeds

## Cursor MCP Config Example

Add this server to your MCP config:

```json
{
  "mcpServers": {
    "rss-incremental-news": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/rss-mcp-server/dist/index.js"],
      "env": {
        "RSS_MCP_DB_PATH": "/ABSOLUTE/PATH/rss-mcp-server/data/rss.sqlite"
      }
    }
  }
}
```

Build before using `dist/index.js`:

```bash
npm run build
```

## Incremental Delivery Model

- `entries`: stores fetched entries (`feed_url + entry_uid` is unique)
- `deliveries`: stores which entries were already returned to agent
- Tool returns only entries not present in `deliveries`, then marks them delivered
