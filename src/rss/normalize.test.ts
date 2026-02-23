import { describe, expect, it } from "vitest"

import { createEntryUid } from "./normalize.js"

describe("createEntryUid", () => {
  it("keeps uid stable for same guid", () => {
    const first = createEntryUid({
      feedUrl: "https://example.com/rss.xml",
      guid: "post-100",
      title: "hello",
    })
    const second = createEntryUid({
      feedUrl: "https://example.com/rss.xml",
      guid: "post-100",
      title: "hello (edited)",
    })
    expect(first).toBe(second)
  })

  it("falls back to link when guid is missing", () => {
    const uidA = createEntryUid({
      feedUrl: "https://example.com/rss.xml",
      link: "https://example.com/news/1#comments",
      title: "News 1",
    })
    const uidB = createEntryUid({
      feedUrl: "https://example.com/rss.xml",
      link: "https://example.com/news/1",
      title: "News 1 updated",
    })
    expect(uidA).toBe(uidB)
  })
})
