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

export interface NewsCountResult {
  total: number
  byFeed: Record<string, number>
}

export interface MarkReadRangeResult {
  matchedEntries: number
  changedDeliveries: number
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

  listKnownFeedUrls(): string[] {
    const rows = this.db
      .prepare(
        `
        SELECT DISTINCT feed_url FROM (
          SELECT feed_url FROM feeds
          UNION
          SELECT feed_url FROM entries
        )
        WHERE feed_url IS NOT NULL AND feed_url != ''
        ORDER BY feed_url
      `,
      )
      .all() as Array<{ feed_url: string }>

    return rows.map((row) => row.feed_url)
  }

  listEntries({
    feedUrl,
    limit,
    sinceTimestamp,
    includeDelivered = false,
  }: {
    feedUrl: string
    limit: number
    sinceTimestamp?: number
    includeDelivered?: boolean
  }): StoredEntry[] {
    const undeliveredClause = includeDelivered ? "" : "AND d.entry_uid IS NULL"
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
          ${undeliveredClause}
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

  listEntriesAcrossFeeds({
    feedUrls,
    limit,
    sinceTimestamp,
    includeDelivered = false,
  }: {
    feedUrls?: string[]
    limit: number
    sinceTimestamp?: number
    includeDelivered?: boolean
  }): StoredEntry[] {
    const nextFeedUrls = (feedUrls ?? []).filter((url) => url.trim().length > 0)
    const hasFeedFilter = nextFeedUrls.length > 0
    const feedPlaceholders = hasFeedFilter ? nextFeedUrls.map(() => "?").join(", ") : ""
    const whereFeedClause = hasFeedFilter ? `AND e.feed_url IN (${feedPlaceholders})` : ""
    const undeliveredClause = includeDelivered ? "" : "AND d.entry_uid IS NULL"
    const sql = `
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
      WHERE (? IS NULL OR COALESCE(e.published_at, e.first_seen_at) >= ?)
        ${whereFeedClause}
        ${undeliveredClause}
      ORDER BY COALESCE(e.published_at, e.first_seen_at) DESC
      LIMIT ?
    `
    const params = hasFeedFilter
      ? [sinceTimestamp ?? null, sinceTimestamp ?? null, ...nextFeedUrls, limit]
      : [sinceTimestamp ?? null, sinceTimestamp ?? null, limit]
    const rows = this.db.prepare(sql).all(...params) as Array<{
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

  listUndeliveredEntries(args: { feedUrl: string; limit: number; sinceTimestamp?: number }) {
    return this.listEntries({
      ...args,
      includeDelivered: false,
    })
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

  countNewsSince({
    sinceTimestamp,
    includeDelivered,
    feedUrls,
  }: {
    sinceTimestamp: number
    includeDelivered: boolean
    feedUrls?: string[]
  }): NewsCountResult {
    const nextFeedUrls = (feedUrls ?? []).filter((url) => url.trim().length > 0)
    const hasFeedFilter = nextFeedUrls.length > 0
    const feedPlaceholders = hasFeedFilter ? nextFeedUrls.map(() => "?").join(", ") : ""

    const whereFeedClause = hasFeedFilter ? `AND e.feed_url IN (${feedPlaceholders})` : ""
    const undeliveredClause = includeDelivered ? "" : "AND d.entry_uid IS NULL"

    const sql = `
      SELECT e.feed_url AS feed_url, COUNT(*) AS count
      FROM entries e
      LEFT JOIN deliveries d
        ON d.feed_url = e.feed_url
       AND d.entry_uid = e.entry_uid
      WHERE COALESCE(e.published_at, e.first_seen_at) >= ?
        ${whereFeedClause}
        ${undeliveredClause}
      GROUP BY e.feed_url
    `

    const params = hasFeedFilter
      ? [sinceTimestamp, ...nextFeedUrls]
      : [sinceTimestamp]

    const rows = this.db.prepare(sql).all(...params) as Array<{
      feed_url: string
      count: number
    }>

    const byFeed: Record<string, number> = {}
    let total = 0
    for (const row of rows) {
      byFeed[row.feed_url] = row.count
      total += row.count
    }

    return {
      total,
      byFeed,
    }
  }

  setReadStatusByTimeRange({
    startTimestamp,
    endTimestamp,
    status,
    feedUrls,
  }: {
    startTimestamp: number
    endTimestamp: number
    status: "read" | "unread"
    feedUrls?: string[]
  }): MarkReadRangeResult {
    const nextFeedUrls = (feedUrls ?? []).filter((url) => url.trim().length > 0)
    const hasFeedFilter = nextFeedUrls.length > 0
    const feedPlaceholders = hasFeedFilter ? nextFeedUrls.map(() => "?").join(", ") : ""
    const feedClause = hasFeedFilter ? `AND e.feed_url IN (${feedPlaceholders})` : ""
    const whereSql = `
      WHERE COALESCE(e.published_at, e.first_seen_at) >= ?
        AND COALESCE(e.published_at, e.first_seen_at) < ?
        ${feedClause}
    `
    const params = hasFeedFilter
      ? [startTimestamp, endTimestamp, ...nextFeedUrls]
      : [startTimestamp, endTimestamp]

    const matchedEntries =
      (
        this.db
          .prepare(
            `
          SELECT COUNT(*) AS count
          FROM entries e
          ${whereSql}
        `,
          )
          .get(...params) as { count: number } | undefined
      )?.count ?? 0

    if (matchedEntries === 0) {
      return { matchedEntries: 0, changedDeliveries: 0 }
    }

    if (status === "read") {
      const insertSql = `
        INSERT OR IGNORE INTO deliveries (id, feed_url, entry_uid, delivered_at)
        SELECT lower(hex(randomblob(16))), e.feed_url, e.entry_uid, ?
        FROM entries e
        ${whereSql}
      `
      const insertParams = hasFeedFilter
        ? [Date.now(), startTimestamp, endTimestamp, ...nextFeedUrls]
        : [Date.now(), startTimestamp, endTimestamp]
      const res = this.db.prepare(insertSql).run(...insertParams)
      return {
        matchedEntries,
        changedDeliveries: res.changes,
      }
    }

    const deleteSql = `
      DELETE FROM deliveries
      WHERE EXISTS (
        SELECT 1
        FROM entries e
        WHERE e.feed_url = deliveries.feed_url
          AND e.entry_uid = deliveries.entry_uid
          AND COALESCE(e.published_at, e.first_seen_at) >= ?
          AND COALESCE(e.published_at, e.first_seen_at) < ?
          ${hasFeedFilter ? `AND e.feed_url IN (${feedPlaceholders})` : ""}
      )
    `
    const deleteParams = hasFeedFilter
      ? [startTimestamp, endTimestamp, ...nextFeedUrls]
      : [startTimestamp, endTimestamp]
    const res = this.db.prepare(deleteSql).run(...deleteParams)

    return {
      matchedEntries,
      changedDeliveries: res.changes,
    }
  }

  close() {
    this.db.close()
  }
}
