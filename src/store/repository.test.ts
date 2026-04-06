import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"

import { afterEach, describe, expect, it } from "vitest"

import type { NormalizedEntry } from "../rss/normalize.js"
import { NewsRepository } from "./repository.js"

const tmpDirs: string[] = []

afterEach(() => {
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function createRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rss-mcp-test-"))
  tmpDirs.push(dir)
  return new NewsRepository(path.join(dir, "test.sqlite"))
}

function createRepoWithPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rss-mcp-test-"))
  tmpDirs.push(dir)
  const dbPath = path.join(dir, "test.sqlite")
  return {
    repo: new NewsRepository(dbPath),
    dbPath,
  }
}

function makeEntry(entryUid: string, title: string): NormalizedEntry {
  return {
    id: randomUUID(),
    entryUid,
    title,
    link: `https://example.com/${entryUid}`,
    publishedAt: Date.now(),
    contentSnippet: null,
  }
}

describe("NewsRepository", () => {
  it("creates database lazily on first repository usage", () => {
    const { repo, dbPath } = createRepoWithPath()
    expect(fs.existsSync(dbPath)).toBe(false)

    const known = repo.listKnownFeedUrls()
    expect(known).toEqual([])
    expect(fs.existsSync(dbPath)).toBe(true)

    repo.close()
  })

  it("deduplicates entries by feed_url + entry_uid", () => {
    const repo = createRepo()
    const feedUrl = "https://example.com/rss.xml"

    const entries = [makeEntry("a", "A"), makeEntry("a", "A duplicated")]
    const inserted = repo.upsertEntries(feedUrl, entries)

    expect(inserted).toBe(1)
    repo.close()
  })

  it("creates, lists, resolves, and removes subscriptions", () => {
    const repo = createRepo()
    const feedUrl = "https://example.com/rss.xml"
    const anotherFeedUrl = "https://another.example.com/rss.xml"

    const upserted = repo.upsertSubscriptions([
      { feedUrl, title: "Example", category: "tech" },
      { feedUrl: anotherFeedUrl, category: "world" },
    ])
    expect(upserted.createdCount).toBe(2)
    expect(upserted.updatedCount).toBe(0)

    const techSubscriptions = repo.listSubscriptions({ category: "tech" })
    expect(techSubscriptions).toHaveLength(1)
    expect(techSubscriptions[0]!.feedUrl).toBe(feedUrl)

    const resolvedFeedUrls = repo.resolveSubscribedFeedUrls({ category: "world" })
    expect(resolvedFeedUrls).toEqual([anotherFeedUrl])

    const removed = repo.removeSubscriptions([anotherFeedUrl], "unsubscribe")
    expect(removed.removedSubscriptions).toBe(1)
    expect(repo.resolveSubscribedFeedUrls()).toEqual([feedUrl])
    repo.close()
  })

  it("normalizes known rsshub instance urls when saving subscriptions", () => {
    const repo = createRepo()

    repo.upsertSubscriptions([
      { feedUrl: "https://rsshub.app/dcfever/reviews/cameras", category: "tech" },
    ])

    const subscriptions = repo.listSubscriptions()
    expect(subscriptions).toHaveLength(1)
    expect(subscriptions[0]!.feedUrl).toBe("rsshub://dcfever/reviews/cameras")
    repo.close()
  })

  it("returns undelivered entries only once", () => {
    const repo = createRepo()
    const feedUrl = "https://example.com/rss.xml"

    repo.upsertEntries(feedUrl, [makeEntry("a", "A"), makeEntry("b", "B")])

    const firstBatch = repo.listUndeliveredEntries({
      feedUrl,
      limit: 10,
    })
    expect(firstBatch).toHaveLength(2)

    repo.markDelivered(
      feedUrl,
      firstBatch.map((entry) => entry.entryUid),
      Date.now(),
    )

    const secondBatch = repo.listUndeliveredEntries({
      feedUrl,
      limit: 10,
    })
    expect(secondBatch).toHaveLength(0)
    repo.close()
  })

  it("counts undelivered and all news by time window", () => {
    const repo = createRepo()
    const feedUrl = "https://example.com/rss.xml"
    const anotherFeedUrl = "https://another.example.com/rss.xml"

    repo.upsertEntries(feedUrl, [makeEntry("a", "A"), makeEntry("b", "B")])
    repo.upsertEntries(anotherFeedUrl, [makeEntry("c", "C")])

    repo.markDelivered(feedUrl, ["a"], Date.now())

    const sinceTimestamp = Date.now() - 60 * 60 * 1000

    const undelivered = repo.countNewsSince({
      sinceTimestamp,
      includeDelivered: false,
    })
    expect(undelivered.total).toBe(2)
    expect(undelivered.byFeed[feedUrl]).toBe(1)
    expect(undelivered.byFeed[anotherFeedUrl]).toBe(1)

    const all = repo.countNewsSince({
      sinceTimestamp,
      includeDelivered: true,
      feedUrls: [feedUrl],
    })
    expect(all.total).toBe(2)
    expect(Object.keys(all.byFeed)).toEqual([feedUrl])
    repo.close()
  })

  it("lists known feed urls and supports includeDelivered in listEntries", () => {
    const repo = createRepo()
    const feedUrl = "https://example.com/rss.xml"

    repo.upsertFeedState({
      feedUrl,
      etag: null,
      lastModified: null,
      lastCheckedAt: Date.now(),
    })
    repo.upsertEntries(feedUrl, [makeEntry("a", "A"), makeEntry("b", "B")])
    repo.markDelivered(feedUrl, ["a"], Date.now())

    const known = repo.listKnownFeedUrls()
    expect(known).toContain(feedUrl)

    const undelivered = repo.listEntries({
      feedUrl,
      limit: 10,
      includeDelivered: false,
    })
    expect(undelivered).toHaveLength(1)

    const allEntries = repo.listEntries({
      feedUrl,
      limit: 10,
      includeDelivered: true,
    })
    expect(allEntries).toHaveLength(2)
    repo.close()
  })

  it("sets read/unread status by time range", () => {
    const repo = createRepo()
    const feedUrl = "https://example.com/rss.xml"

    const now = Date.now()
    const dayStart = new Date(new Date(now).toISOString().slice(0, 10) + "T00:00:00.000Z").getTime()
    const dayEnd = dayStart + 24 * 60 * 60 * 1000

    repo.upsertEntries(feedUrl, [makeEntry("a", "A"), makeEntry("b", "B"), makeEntry("c", "C")])

    const markRead = repo.setReadStatusByTimeRange({
      startTimestamp: dayStart,
      endTimestamp: dayEnd,
      status: "read",
      feedUrls: [feedUrl],
    })
    expect(markRead.matchedEntries).toBe(3)
    expect(markRead.changedDeliveries).toBe(3)

    const undeliveredAfterRead = repo.listEntries({
      feedUrl,
      limit: 10,
      includeDelivered: false,
    })
    expect(undeliveredAfterRead).toHaveLength(0)

    const markUnread = repo.setReadStatusByTimeRange({
      startTimestamp: dayStart,
      endTimestamp: dayEnd,
      status: "unread",
      feedUrls: [feedUrl],
    })
    expect(markUnread.matchedEntries).toBe(3)
    expect(markUnread.changedDeliveries).toBe(3)

    const undeliveredAfterUnread = repo.listEntries({
      feedUrl,
      limit: 10,
      includeDelivered: false,
    })
    expect(undeliveredAfterUnread).toHaveLength(3)
    repo.close()
  })

  it("lists globally latest entries across feeds with total limit", () => {
    const repo = createRepo()
    const feedA = "https://a.example.com/rss.xml"
    const feedB = "https://b.example.com/rss.xml"

    repo.upsertEntries(feedA, [makeEntry("a1", "A1"), makeEntry("a2", "A2")])
    repo.upsertEntries(feedB, [makeEntry("b1", "B1"), makeEntry("b2", "B2")])

    const entries = repo.listEntriesAcrossFeeds({
      feedUrls: [feedA, feedB],
      limit: 3,
      includeDelivered: true,
    })
    expect(entries).toHaveLength(3)
    repo.close()
  })
})
