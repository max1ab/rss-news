# AGENTS.md

Agent guidance for `rss-news-mcp`.

## Project scope

- Node.js + TypeScript MCP server.
- Main goal: fetch RSS news incrementally and return consistent results to MCP callers.
- Runtime DB: SQLite at `./data/rss-mcp.sqlite` by default.

## Core data model (do not break semantics)

- `entries`: fetched news storage (`feed_url + entry_uid` is unique).
- `deliveries`: read/delivered marker storage.
- Read-state mapping in this project:
  - **read** = exists in `deliveries`
  - **unread** = not in `deliveries`

## MCP tool contracts

- `fetch_latest_news`
  - `feedUrls` is optional; if missing, use all known feeds from DB.
  - `limit` is a **global total limit** across feeds (not per-feed).
  - `includeDelivered=false` means only unread/undelivered items.
  - Returned `publishedAt` / `firstSeenAt` must be `YYYY-MM-DD` strings.
- `get_news_count`
  - Supports `includeDelivered` switch (`undelivered` vs `all`).
- `set_read_status_by_time_range`
  - Changes read state by date range via `deliveries` insert/delete.

## RSS and parsing rules

- `rsshub://...` must be expanded to RSSHub instances with fallback retry.
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
