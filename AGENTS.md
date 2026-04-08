# AGENTS.md

Agent guidance for `rss-news-mcp`.

## Project scope

- Node.js + TypeScript MCP server.
- Main goal: manage RSS subscriptions, sync news incrementally, and expose stable MCP tools for previewing, fetching, consuming, and counting news.
- Runtime DB default:
  - Windows: `%APPDATA%/rss-news/rss.sqlite`
  - Other platforms: `~/.local/share/rss-news/rss.sqlite`

## Core data model (do not break semantics)

- `subscriptions`: current subscribed feeds plus sync metadata.
- `entries`: fetched news storage (`feed_url + entry_uid` is unique).
- `deliveries`: consumed marker storage.
- State mapping in this project:
  - **consumed** = exists in `deliveries`
  - **unconsumed** = not in `deliveries`
- On first creation of a new database, seed default subscriptions from `example-subscriptions.json`.

## MCP tool contracts

- `list_subscriptions`
  - Returns current subscriptions and sync metadata from `subscriptions`.
- `upsert_subscriptions`
  - Adds or updates subscriptions.
  - Known RSSHub instance URLs must be normalized to canonical `rsshub://...` feedUrls.
  - Return both `inputFeedUrl` and canonical `feedUrl`.
- `remove_subscriptions`
  - Removes subscriptions by canonical `feedUrl`.
  - RSSHub subscriptions must be removed using the stored `rsshub://...` feedUrl.
  - `mode=purge` also deletes matching `entries` and `deliveries`.
- `preview_feed`
  - Does not write `subscriptions`, `entries`, or `deliveries`.
  - Supports multiple feed URLs in one request.
  - Returns canonical `feedUrl` for each input.
- `sync_news`
  - `feedUrls` is optional; if missing, use all subscribed feeds.
  - Reject unsubscribed `feedUrls`.
- `fetch_news`
  - `feedUrls` is optional; if missing, use all subscribed feeds.
  - `limit` is a **global total limit** across feeds (not per-feed).
  - `includeConsumed=false` means only unconsumed items.
  - Does not modify `deliveries`.
  - Returned `publishedAt` / `firstSeenAt` must be `YYYY-MM-DD` strings.
- `consume_news`
  - Same query shape as `fetch_news`.
  - Marks returned unconsumed items in `deliveries`.
- `count_news`
  - Supports `includeConsumed` switch.
- `set_consumption_status`
  - Changes consumed state by date range via `deliveries` insert/delete.
  - Date input is `YYYY-MM-DD` and treated in UTC day boundaries.

## RSS and parsing rules

- `rsshub://...` must be expanded to RSSHub instances with fallback retry.
- Known RSSHub instance URLs like `https://rsshub.app/...` must be normalized to canonical `rsshub://...` when subscriptions are inserted.
- Keep conditional request behavior (`ETag`, `Last-Modified`).
- If source has no `pubDate`/`isoDate`, rely on `first_seen_at` fallback.

## Time and ordering rules

- DB stores timestamps as epoch milliseconds (`INTEGER`).
- Query ordering must use `COALESCE(published_at, first_seen_at) DESC`.

## Before finishing any code change

Run in project root:

```bash
npm run build
npm test
```

If behavior changed, update `README.md` tool examples accordingly.
