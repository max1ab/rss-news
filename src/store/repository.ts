import { randomUUID } from "node:crypto"

import type Database from "better-sqlite3"

import { normalizeRssHubUrl } from "../rss/fetcher.js"
import type { NormalizedEntry } from "../rss/normalize.js"
import { createDatabase } from "./sqlite.js"

export interface FeedState {
  feedUrl: string
  etag: string | null
  lastModified: string | null
  lastCheckedAt: number | null
}

export interface SubscriptionRecord extends FeedState {
  title: string | null
  category: string | null
  createdAt: number
  updatedAt: number
}

export interface UpsertSubscriptionInput {
  feedUrl: string
  title?: string | null
  category?: string | null
}

export interface UpsertSubscriptionsResult {
  createdCount: number
  updatedCount: number
  items: Array<{
    inputFeedUrl: string
    feedUrl: string
    status: "created" | "updated"
  }>
}

export interface RemoveSubscriptionsResult {
  removedSubscriptions: number
  removedEntries: number
  removedDeliveries: number
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
  isDelivered: boolean
}

export interface NewsCountResult {
  total: number
  byFeed: Record<string, number>
}

export interface MarkReadRangeResult {
  matchedEntries: number
  changedDeliveries: number
}

type SubscriptionRow = {
  feed_url: string
  title: string | null
  category: string | null
  etag: string | null
  last_modified: string | null
  last_checked_at: number | null
  created_at: number
  updated_at: number
}

export class NewsRepository {
  private readonly dbPath: string
  private db: Database.Database | null = null

  constructor(dbPath: string) {
    this.dbPath = dbPath
  }

  private getDb() {
    if (!this.db) {
      this.db = createDatabase(this.dbPath)
    }
    return this.db
  }

  private mapSubscription(row: SubscriptionRow): SubscriptionRecord {
    return {
      feedUrl: row.feed_url,
      title: row.title,
      category: row.category,
      etag: row.etag,
      lastModified: row.last_modified,
      lastCheckedAt: row.last_checked_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private normalizeFeedUrls(feedUrls?: string[]) {
    return [...new Set(
      (feedUrls ?? [])
        .map((url) => url.trim())
        .filter((url) => url.length > 0),
    )]
  }

  listSubscriptions(args?: { feedUrls?: string[]; category?: string | null }): SubscriptionRecord[] {
    const db = this.getDb()
    const feedUrls = this.normalizeFeedUrls(args?.feedUrls)
    const hasFeedFilter = feedUrls.length > 0
    const category = args?.category?.trim() || null
    const feedClause = hasFeedFilter ? `WHERE feed_url IN (${feedUrls.map(() => "?").join(", ")})` : ""
    const categoryClause = category
      ? `${hasFeedFilter ? " AND" : " WHERE"} category = ?`
      : ""
    const rows = db
      .prepare(
        `
          SELECT
            feed_url,
            title,
            category,
            etag,
            last_modified,
            last_checked_at,
            created_at,
            updated_at
          FROM subscriptions
          ${feedClause}
          ${categoryClause}
          ORDER BY feed_url
        `,
      )
      .all(...feedUrls, ...(category ? [category] : [])) as SubscriptionRow[]

    return rows.map((row) => this.mapSubscription(row))
  }

  resolveSubscribedFeedUrls(args?: { feedUrls?: string[]; category?: string | null }): string[] {
    const requestedFeedUrls = this.normalizeFeedUrls(args?.feedUrls)
    const subscriptions = this.listSubscriptions({
      feedUrls: requestedFeedUrls.length > 0 ? requestedFeedUrls : undefined,
      category: args?.category,
    })
    const resolvedFeedUrls = subscriptions.map((item) => item.feedUrl)

    if (requestedFeedUrls.length > 0 && resolvedFeedUrls.length !== requestedFeedUrls.length) {
      const resolvedSet = new Set(resolvedFeedUrls)
      const missing = requestedFeedUrls.filter((feedUrl) => !resolvedSet.has(feedUrl))
      throw new Error(`feedUrls are not subscribed: ${missing.join(", ")}`)
    }

    return resolvedFeedUrls
  }

  upsertSubscriptions(items: UpsertSubscriptionInput[]): UpsertSubscriptionsResult {
    const db = this.getDb()
    const normalizedItems = [...new Map(
      items
        .map((item) => ({
          inputFeedUrl: item.feedUrl.trim(),
          feedUrl: normalizeRssHubUrl(item.feedUrl.trim()),
          title: item.title?.trim() || null,
          category: item.category?.trim() || null,
        }))
        .filter((item) => item.feedUrl.length > 0)
        .map((item) => [item.feedUrl, item] as const),
    ).values()]

    if (normalizedItems.length === 0) {
      return {
        createdCount: 0,
        updatedCount: 0,
        items: [],
      }
    }

    const existing = new Set(
      this.listSubscriptions({ feedUrls: normalizedItems.map((item) => item.feedUrl) }).map(
        (item) => item.feedUrl,
      ),
    )

    const insert = db.prepare(
      `
        INSERT INTO subscriptions (
          feed_url,
          title,
          category,
          etag,
          last_modified,
          last_checked_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?)
        ON CONFLICT(feed_url) DO UPDATE SET
          title = excluded.title,
          category = excluded.category,
          updated_at = excluded.updated_at
      `,
    )

    const results: UpsertSubscriptionsResult["items"] = []
    let createdCount = 0
    let updatedCount = 0

    const tx = db.transaction(() => {
      const now = Date.now()
      for (const item of normalizedItems) {
        const status = existing.has(item.feedUrl) ? "updated" : "created"
        insert.run(item.feedUrl, item.title, item.category, now, now)
        results.push({
          inputFeedUrl: item.inputFeedUrl,
          feedUrl: item.feedUrl,
          status,
        })
        if (status === "created") {
          createdCount += 1
        } else {
          updatedCount += 1
        }
      }
    })
    tx()

    return {
      createdCount,
      updatedCount,
      items: results,
    }
  }

  removeSubscriptions(feedUrls: string[], mode: "unsubscribe" | "purge"): RemoveSubscriptionsResult {
    const db = this.getDb()
    const normalizedFeedUrls = [...new Set(feedUrls.map((url) => url.trim()).filter((url) => url.length > 0))]
    if (normalizedFeedUrls.length === 0) {
      return {
        removedSubscriptions: 0,
        removedEntries: 0,
        removedDeliveries: 0,
      }
    }

    const placeholders = normalizedFeedUrls.map(() => "?").join(", ")
    let removedSubscriptions = 0
    let removedEntries = 0
    let removedDeliveries = 0

    const tx = db.transaction(() => {
      if (mode === "purge") {
        removedDeliveries = db
          .prepare(`DELETE FROM deliveries WHERE feed_url IN (${placeholders})`)
          .run(...normalizedFeedUrls).changes
        removedEntries = db
          .prepare(`DELETE FROM entries WHERE feed_url IN (${placeholders})`)
          .run(...normalizedFeedUrls).changes
      }

      removedSubscriptions = db
        .prepare(`DELETE FROM subscriptions WHERE feed_url IN (${placeholders})`)
        .run(...normalizedFeedUrls).changes
    })
    tx()

    return {
      removedSubscriptions,
      removedEntries,
      removedDeliveries,
    }
  }

  getFeedState(feedUrl: string): FeedState | null {
    const row = this.getDb()
      .prepare(
        `
          SELECT
            feed_url,
            etag,
            last_modified,
            last_checked_at,
            title,
            category,
            created_at,
            updated_at
          FROM subscriptions
          WHERE feed_url = ?
        `,
      )
      .get(feedUrl) as SubscriptionRow | undefined

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
    const now = Date.now()
    this.getDb()
      .prepare(
        `
          INSERT INTO subscriptions (
            feed_url,
            title,
            category,
            etag,
            last_modified,
            last_checked_at,
            created_at,
            updated_at
          )
          VALUES (?, NULL, NULL, ?, ?, ?, ?, ?)
          ON CONFLICT(feed_url) DO UPDATE SET
            etag = excluded.etag,
            last_modified = excluded.last_modified,
            last_checked_at = excluded.last_checked_at,
            updated_at = excluded.updated_at
        `,
      )
      .run(feedUrl, etag, lastModified, lastCheckedAt, now, now)
  }

  listKnownFeedUrls(): string[] {
    return this.resolveSubscribedFeedUrls()
  }

  upsertEntries(feedUrl: string, entries: NormalizedEntry[]) {
    if (entries.length === 0) return 0

    const db = this.getDb()
    const now = Date.now()
    const insert = db.prepare(
      `
        INSERT OR IGNORE INTO entries
        (id, feed_url, entry_uid, title, link, published_at, content_snippet, first_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )

    let inserted = 0
    const tx = db.transaction(() => {
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
    return this.listEntriesAcrossFeeds({
      feedUrls: [feedUrl],
      limit,
      sinceTimestamp,
      includeDelivered,
    })
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
    const db = this.getDb()
    const nextFeedUrls = this.normalizeFeedUrls(feedUrls)
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
        e.first_seen_at,
        CASE WHEN d.entry_uid IS NULL THEN 0 ELSE 1 END AS is_delivered
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
    const rows = db.prepare(sql).all(...params) as Array<{
      id: string
      feed_url: string
      entry_uid: string
      title: string
      link: string | null
      published_at: number | null
      content_snippet: string | null
      first_seen_at: number
      is_delivered: number
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
      isDelivered: row.is_delivered === 1,
    }))
  }

  listUndeliveredEntries(args: { feedUrl: string; limit: number; sinceTimestamp?: number }) {
    return this.listEntries({
      ...args,
      includeDelivered: false,
    })
  }

  markDelivered(feedUrl: string, entryUids: string[], deliveredAt: number) {
    if (entryUids.length === 0) return 0
    const db = this.getDb()
    const insert = db.prepare(
      `
        INSERT OR IGNORE INTO deliveries (id, feed_url, entry_uid, delivered_at)
        VALUES (?, ?, ?, ?)
      `,
    )

    let inserted = 0
    const tx = db.transaction(() => {
      for (const entryUid of entryUids) {
        inserted += insert.run(randomUUID(), feedUrl, entryUid, deliveredAt).changes
      }
    })
    tx()

    return inserted
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
    const db = this.getDb()
    const nextFeedUrls = this.normalizeFeedUrls(feedUrls)
    const hasFeedFilter = nextFeedUrls.length > 0
    const feedPlaceholders = hasFeedFilter ? nextFeedUrls.map(() => "?").join(", ") : ""
    const whereFeedClause = hasFeedFilter ? `AND e.feed_url IN (${feedPlaceholders})` : ""
    const undeliveredClause = includeDelivered ? "" : "AND d.entry_uid IS NULL"

    const rows = db
      .prepare(
        `
          SELECT e.feed_url AS feed_url, COUNT(*) AS count
          FROM entries e
          LEFT JOIN deliveries d
            ON d.feed_url = e.feed_url
           AND d.entry_uid = e.entry_uid
          WHERE COALESCE(e.published_at, e.first_seen_at) >= ?
            ${whereFeedClause}
            ${undeliveredClause}
          GROUP BY e.feed_url
        `,
      )
      .all(sinceTimestamp, ...nextFeedUrls) as Array<{
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
    const db = this.getDb()
    const nextFeedUrls = this.normalizeFeedUrls(feedUrls)
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
        db
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
      const res = db.prepare(insertSql).run(...insertParams)
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
    const res = db.prepare(deleteSql).run(...deleteParams)

    return {
      matchedEntries,
      changedDeliveries: res.changes,
    }
  }

  close() {
    this.db?.close()
    this.db = null
  }
}
