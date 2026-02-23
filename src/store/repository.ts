import { randomUUID } from "node:crypto"

import type Database from "better-sqlite3"

import type { NormalizedEntry } from "../rss/normalize.js"
import { createDatabase } from "./sqlite.js"

export interface FeedState {
  feedUrl: string
  etag: string | null
  lastModified: string | null
  lastCheckedAt: number
}

export interface StoredEntry {
  id: string
  feedUrl: string
  entryUid: string
  title: string
  link: string | null
  publishedAt: number | null
  contentSnippet: string | null
  firstSeenAt: number
}

export class NewsRepository {
  private readonly db: Database.Database

  constructor(dbPath: string) {
    this.db = createDatabase(dbPath)
  }

  getFeedState(feedUrl: string): FeedState | null {
    const row = this.db
      .prepare(
        `
        SELECT feed_url, etag, last_modified, last_checked_at
        FROM feeds
        WHERE feed_url = ?
      `,
      )
      .get(feedUrl) as
      | {
          feed_url: string
          etag: string | null
          last_modified: string | null
          last_checked_at: number
        }
      | undefined

    if (!row) return null

    return {
      feedUrl: row.feed_url,
      etag: row.etag,
      lastModified: row.last_modified,
      lastCheckedAt: row.last_checked_at,
    }
  }

  upsertFeedState({
    feedUrl,
    etag,
    lastModified,
    lastCheckedAt,
  }: {
    feedUrl: string
    etag: string | null
    lastModified: string | null
    lastCheckedAt: number
  }) {
    this.db
      .prepare(
        `
        INSERT INTO feeds (feed_url, etag, last_modified, last_checked_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(feed_url) DO UPDATE SET
          etag = excluded.etag,
          last_modified = excluded.last_modified,
          last_checked_at = excluded.last_checked_at
      `,
      )
      .run(feedUrl, etag, lastModified, lastCheckedAt)
  }

  upsertEntries(feedUrl: string, entries: NormalizedEntry[]) {
    if (entries.length === 0) return 0

    const now = Date.now()
    const insert = this.db.prepare(
      `
      INSERT OR IGNORE INTO entries
      (id, feed_url, entry_uid, title, link, published_at, content_snippet, first_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )

    let inserted = 0
    const tx = this.db.transaction(() => {
      for (const entry of entries) {
        const result = insert.run(
          entry.id,
          feedUrl,
          entry.entryUid,
          entry.title,
          entry.link,
          entry.publishedAt,
          entry.contentSnippet,
          now,
        )
        inserted += result.changes
      }
    })
    tx()

    return inserted
  }

  listUndeliveredEntries({
    feedUrl,
    limit,
    sinceTimestamp,
  }: {
    feedUrl: string
    limit: number
    sinceTimestamp?: number
  }): StoredEntry[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          e.id,
          e.feed_url,
          e.entry_uid,
          e.title,
          e.link,
          e.published_at,
          e.content_snippet,
          e.first_seen_at
        FROM entries e
        LEFT JOIN deliveries d
          ON d.feed_url = e.feed_url
         AND d.entry_uid = e.entry_uid
        WHERE e.feed_url = ?
          AND d.entry_uid IS NULL
          AND (? IS NULL OR COALESCE(e.published_at, e.first_seen_at) >= ?)
        ORDER BY COALESCE(e.published_at, e.first_seen_at) DESC
        LIMIT ?
      `,
      )
      .all(feedUrl, sinceTimestamp ?? null, sinceTimestamp ?? null, limit) as Array<{
      id: string
      feed_url: string
      entry_uid: string
      title: string
      link: string | null
      published_at: number | null
      content_snippet: string | null
      first_seen_at: number
    }>

    return rows.map((row) => ({
      id: row.id,
      feedUrl: row.feed_url,
      entryUid: row.entry_uid,
      title: row.title,
      link: row.link,
      publishedAt: row.published_at,
      contentSnippet: row.content_snippet,
      firstSeenAt: row.first_seen_at,
    }))
  }

  markDelivered(feedUrl: string, entryUids: string[], deliveredAt: number) {
    if (entryUids.length === 0) return
    const insert = this.db.prepare(
      `
      INSERT OR IGNORE INTO deliveries (id, feed_url, entry_uid, delivered_at)
      VALUES (?, ?, ?, ?)
    `,
    )

    const tx = this.db.transaction(() => {
      for (const entryUid of entryUids) {
        insert.run(randomUUID(), feedUrl, entryUid, deliveredAt)
      }
    })
    tx()
  }

  close() {
    this.db.close()
  }
}
