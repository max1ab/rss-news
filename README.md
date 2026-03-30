# RSS News MCP

[中文说明](./README.zh-CN.md)

```text
 ____  ____ ____    _   _                     __  __  ____ ____  
|  _ \/ ___/ ___|  | \ | | _____      _____  |  \/  |/ ___|  _ \ 
| |_) \___ \___ \  |  \| |/ _ \ \ /\ / / __| | |\/| | |   | |_) |
|  _ < ___) |__) | | |\  |  __/\ V  V /\__ \ | |  | | |___|  __/ 
|_| \_\____/____/  |_| \_|\___| \_/\_/ |___/ |_|  |_|\____|_|    
                                                                
```

Cut through noise and clickbait. With one `npx` command, your AI can connect to and process first-hand news sources.

## Use It With MCP

Add this server to your MCP config:

```json
{
  "mcpServers": {
    "rss-news": {
      "command": "npx",
      "args": ["-y", "@max1ab/rss-news"]
    }
  }
}
```

If you want the SQLite database in a custom location:

```json
{
  "mcpServers": {
    "rss-news": {
      "command": "npx",
      "args": ["-y", "@max1ab/rss-news"],
      "env": {
        "RSS_MCP_DB_PATH": "/ABSOLUTE/PATH/rss-news/data/rss.sqlite"
      }
    }
  }
}
```

## Why Use It

Most AI workflows still depend on search results, summaries of summaries, or noisy feeds with repeated items. `@max1ab/rss-news` gives your MCP client a steadier input layer: direct RSS/Atom sources, incremental delivery, and a persistent memory of what has already been seen.

It is built for people who want their AI to:

- track real news sources instead of recycled headlines
- follow multiple feeds without manually deduplicating results
- pull only fresh items on each run
- keep a portable local history in SQLite

## What Your AI Can Do With It

- Refresh RSS and Atom feeds into a local SQLite database
- Pull the latest items across all feeds in one globally sorted stream
- Avoid repeated items by remembering what has already been delivered
- Count recent items for monitoring or recurring workflows
- Reset read state by time range when you want to reprocess a window
- Work with both standard feed URLs and `rsshub://...` sources

In practice, the common flow is simple:

1. Refresh feeds
2. Ask for the latest undelivered items
3. Let the server remember what has already been seen

## Incremental Delivery Model

- Database file is created lazily on first repository usage if it does not exist.
- `entries`: stores fetched entries (`feed_url + entry_uid` is unique)
- `deliveries`: stores which entries were already returned to agent
- Tool returns only entries not present in `deliveries`, then marks them delivered

## Advanced Setup

### Environment Variables

- `RSS_MCP_DB_PATH`: SQLite path (default: `<project-root>/data/rss.sqlite`)
- `RSS_MCP_REQUEST_TIMEOUT_MS`: fetch timeout in milliseconds (default: `15000`)
- `RSS_MCP_DEFAULT_LIMIT_PER_FEED`: default return limit per feed (default: `20`)
- `RSS_MCP_MAX_FEEDS_PER_REQUEST`: max feed count for each call (default: `50`)
- `RSS_MCP_USER_AGENT`: custom request User-Agent
- `RSS_MCP_DEBUG`: set `1` or `true` to enable debug logs
- `RSS_MCP_DEBUG_PREVIEW_LENGTH`: preview length of response body for debug (default: `300`)

### Local Development

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
