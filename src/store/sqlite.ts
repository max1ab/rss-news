import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import Database from "better-sqlite3"

function ensureParentDir(filePath: string) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
}

type DefaultSubscription = {
  feedUrl: string
  title?: string | null
  category?: string | null
}

function loadDefaultSubscriptions() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const defaultSubscriptionsPath = path.resolve(moduleDir, "..", "..", "example-subscriptions.json")
  const raw = fs.readFileSync(defaultSubscriptionsPath, "utf8")
  return JSON.parse(raw) as DefaultSubscription[]
}

function seedDefaultSubscriptions(db: Database.Database) {
  const defaultSubscriptions = loadDefaultSubscriptions()
  if (defaultSubscriptions.length === 0) return

  const now = Date.now()
  const insert = db.prepare(
    `
      INSERT OR IGNORE INTO subscriptions (
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
    `,
  )

  const tx = db.transaction(() => {
    for (const subscription of defaultSubscriptions) {
      insert.run(
        subscription.feedUrl,
        subscription.title ?? null,
        subscription.category ?? null,
        now,
        now,
      )
    }
  })
  tx()
}

export function createDatabase(dbPath: string) {
  const isNewDatabase = !fs.existsSync(dbPath)
  ensureParentDir(dbPath)
  const db = new Database(dbPath)

  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")

  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      feed_url TEXT PRIMARY KEY,
      title TEXT,
      category TEXT,
      etag TEXT,
      last_modified TEXT,
      last_checked_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      feed_url TEXT NOT NULL,
      entry_uid TEXT NOT NULL,
      title TEXT NOT NULL,
      link TEXT,
      published_at INTEGER,
      content_snippet TEXT,
      first_seen_at INTEGER NOT NULL,
      UNIQUE(feed_url, entry_uid)
    );

    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY,
      feed_url TEXT NOT NULL,
      entry_uid TEXT NOT NULL,
      delivered_at INTEGER NOT NULL,
      UNIQUE(feed_url, entry_uid)
    );

    CREATE INDEX IF NOT EXISTS idx_entries_feed_time
      ON entries(feed_url, published_at DESC, first_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_category
      ON subscriptions(category);
    CREATE INDEX IF NOT EXISTS idx_deliveries_feed_url
      ON deliveries(feed_url);
  `)

  if (isNewDatabase) {
    seedDefaultSubscriptions(db)
  }

  return db
}
