# RSS News MCP

```text
 ____  ____ ____    _   _                     __  __  ____ ____  
|  _ \/ ___/ ___|  | \ | | _____      _____  |  \/  |/ ___|  _ \ 
| |_) \___ \___ \  |  \| |/ _ \ \ /\ / / __| | |\/| | |   | |_) |
|  _ < ___) |__) | | |\  |  __/\ V  V /\__ \ | |  | | |___|  __/ 
|_| \_\____/____/  |_| \_|\___| \_/\_/ |___/ |_|  |_|\____|_|    
                                                                
```

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

### `update_news`

Fetch configured feeds and update local `entries`/`feeds` state.

Input:

```json
{
  "feedUrls": ["https://example.com/rss.xml", "rsshub://deeplearning/the-batch"]
}
```

Output:

- `ok`: whether tool call completed
- `resolvedFeedUrls`: actual feed list used by this call
- `summary`: aggregate update stats (`feedsTotal`, `successFeeds`, `errorFeeds`, `fetchedTotal`, `insertedTotal`, `skipped304Feeds`)
- `errors`: per-feed error list (`feedUrl`, `message`)
- `updatedAt`: ISO timestamp

### `fetch_latest_news`

Input:

```json
{
  "feedUrls": ["https://example.com/rss.xml", "rsshub://deeplearning/the-batch"],
  "limit": 20,
  "sinceMinutes": 120,
  "includeDelivered": false
}
```

Output:

- `items`: globally latest news sorted by timestamp (across all selected feeds)
- `includeDelivered`: when `true`, return all news in time window and do not mark deliveries
- `resolvedFeedUrls`: actual feed list used by this call
- `limit`: global result limit (not per feed)

Notes:

- `feedUrls` is now optional. If omitted, server uses all known RSS sources from the database.
- Default mode is `includeDelivered: false` (only undelivered news).
- `fetch_latest_news` no longer pulls remote RSS by itself; call `update_news` first to refresh data.

### `get_news_count`

Count news in the past N hours.

Input:

```json
{
  "pastHours": 24,
  "includeDelivered": false,
  "feedUrls": ["https://example.com/rss.xml"]
}
```

Output fields:

- `countType`: `undelivered` or `all`
- `totalCount`: summed count
- `countsByFeed`: per-feed count map

### `set_read_status_by_time_range`

Set read/unread status in a date range.

Input:

```json
{
  "startDate": "2026-02-20",
  "endDate": "2026-02-23",
  "status": "read",
  "feedUrls": ["https://example.com/rss.xml"]
}
```

Behavior:

- `status: "read"`: mark matched entries as read (insert into `deliveries`)
- `status: "unread"`: mark matched entries as unread (delete from `deliveries`)

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
