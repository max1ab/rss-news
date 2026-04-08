```text
 ____  ____ ____    _   _                     __  __  ____ ____  
|  _ \/ ___/ ___|  | \ | | _____      _____  |  \/  |/ ___|  _ \ 
| |_) \___ \___ \  |  \| |/ _ \ \ /\ / / __| | |\/| | |   | |_) |
|  _ < ___) |__) | | |\  |  __/\ V  V /\__ \ | |  | | |___|  __/ 
|_| \_\____/____/  |_| \_|\___| \_/\_/ |___/ |_|  |_|\____|_|    
                                                                
```

[![npm-@max1ab/rss-news](https://img.shields.io/badge/npm-%40max1ab%2Frss--news-CB3837)](https://www.npmjs.com/package/@max1ab/rss-news)
[![lang-中文](https://img.shields.io/badge/lang-%E4%B8%AD%E6%96%87-blue)](./README.zh-CN.md)

Cut through noise and clickbait. With one `npx` command, your AI can connect to and process first-hand news sources.

## Install MCP

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

## Examples

You can directly say things like this to an AI that supports MCP:

1. Help me review the past 24 hours of news, summarize the important items, and organize the summary into Notion.
2. Help me check unread news, pick the most important items, and send a message to my phone.
3. Help me follow the latest OpenAI news. If I am not subscribed yet, add suitable subscriptions first.
4. Help me search for some AI-related RSS sources, preview the content quality, and subscribe to the good ones.
5. Help me count how many unread news items appeared in the past 24 hours, grouped by source.

## Features

- Manage subscriptions
- Sync the latest news
- Fetch unread news
- Consume news
- Count news
- Reset state

- Seed example subscriptions from `example-subscriptions.json` when a new database is created

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

### Current Tools

- Database file is created lazily on first repository usage if it does not exist.
- `subscriptions`: stores subscribed feeds plus fetch metadata
- `entries`: stores fetched entries (`feed_url + entry_uid` is unique)
- `deliveries`: stores which entries have already been consumed

Available MCP tools:

- `list_subscriptions`
- `upsert_subscriptions`
- `remove_subscriptions`
- `preview_feed`
  Preview one or more feed URLs before subscribing, to confirm they can be fetched and the content is suitable.
- `sync_news`
- `fetch_news`
- `consume_news`
- `count_news`
- `set_consumption_status`
