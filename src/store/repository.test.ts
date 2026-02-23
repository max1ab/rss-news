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
  it("deduplicates entries by feed_url + entry_uid", () => {
    const repo = createRepo()
    const feedUrl = "https://example.com/rss.xml"

    const entries = [makeEntry("a", "A"), makeEntry("a", "A duplicated")]
    const inserted = repo.upsertEntries(feedUrl, entries)

    expect(inserted).toBe(1)
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
})
