import { describe, expect, it } from "vitest"

import { expandRssHubUrls, normalizeRssHubUrl } from "./fetcher.js"

describe("expandRssHubUrls", () => {
  it("keeps normal http feed urls unchanged", () => {
    const url = "https://example.com/rss.xml"
    expect(expandRssHubUrls(url)).toEqual([url])
  })

  it("expands rsshub protocol to fallback instances", () => {
    const urls = expandRssHubUrls("rsshub://deeplearning/the-batch")

    expect(urls[0]).toBe("https://rsshub.app/deeplearning/the-batch")
    expect(urls).toContain("https://rsshub.rssforever.com/deeplearning/the-batch")
    expect(urls).toContain("https://rsshub.aierliz.xyz/deeplearning/the-batch")
    expect(urls.length).toBeGreaterThan(5)
  })

  it("normalizes rsshub instance urls to rsshub protocol", () => {
    expect(normalizeRssHubUrl("https://rsshub.app/dcfever/reviews/cameras")).toBe(
      "rsshub://dcfever/reviews/cameras",
    )
    expect(normalizeRssHubUrl("https://rsshub.rssforever.com/test/path?lang=zh")).toBe(
      "rsshub://test/path?lang=zh",
    )
  })
})
