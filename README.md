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

- Manage a subscription list for RSS and Atom feeds
- Sync subscribed feeds into a local SQLite database
- Fetch the latest items across all subscriptions in one globally sorted stream
- Consume items explicitly and remember what has already been read
- Count recent items for monitoring or recurring workflows
- Reset consumed state by time range when you want to reprocess a window
- Work with both standard feed URLs and `rsshub://...` sources

In practice, the common flow is simple:

1. Upsert subscriptions
2. Sync subscribed feeds
3. Fetch or consume the latest unread items

## Current Tools

- Database file is created lazily on first repository usage if it does not exist.
- `subscriptions`: stores subscribed feeds plus fetch metadata
- `entries`: stores fetched entries (`feed_url + entry_uid` is unique)
- `deliveries`: stores which entries have already been consumed

Available MCP tools:

- `list_subscriptions`
- `upsert_subscriptions`
- `remove_subscriptions`
- `preview_feed`
  Preview a new feed URL before subscribing, to confirm it can be fetched and the content is suitable.
- `sync_news`
- `fetch_news`
- `consume_news`
- `count_news`
- `set_consumption_status`

## Advanced Setup

### Environment Variables

- `RSS_MCP_DB_PATH`: SQLite path (default: `%APPDATA%/rss-news/rss.sqlite` on Windows, `~/.local/share/rss-news/rss.sqlite` on other platforms)
- `RSS_MCP_REQUEST_TIMEOUT_MS`: fetch timeout in milliseconds (default: `15000`)
- `RSS_MCP_DEFAULT_FETCH_LIMIT`: default global fetch limit (default: `20`)
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
