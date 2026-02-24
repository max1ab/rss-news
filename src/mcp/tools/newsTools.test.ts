import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import type { AppConfig } from "../../config.js"
import { fetchRssFeed } from "../../rss/fetcher.js"
import { NewsRepository } from "../../store/repository.js"
import { registerFetchLatestNewsTool } from "./fetchLatestNews.js"
import { registerUpdateNewsTool } from "./updateNews.js"

vi.mock("../../rss/fetcher.js", () => ({
  fetchRssFeed: vi.fn(),
}))

type ToolHandler = (input: unknown) => Promise<{
  content: Array<{ type: string; text: string }>
}>

const tmpDirs: string[] = []

afterEach(() => {
  vi.clearAllMocks()
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function createRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rss-mcp-tools-test-"))
  tmpDirs.push(dir)
  return new NewsRepository(path.join(dir, "test.sqlite"))
}

function createConfig(): AppConfig {
  return {
    dbPath: ":memory:",
    requestTimeoutMs: 1000,
    defaultLimitPerFeed: 20,
    maxFeedUrlsPerRequest: 50,
    userAgent: "test-agent",
    debugEnabled: false,
    debugResponsePreviewLength: 0,
  }
}

function createToolServer() {
  const handlers = new Map<string, ToolHandler>()
  return {
    server: {
      tool(name: string, _description: string, _schema: unknown, handler: ToolHandler) {
        handlers.set(name, handler)
      },
    },
    getHandler(name: string) {
      const handler = handlers.get(name)
      if (!handler) throw new Error(`Tool not registered: ${name}`)
      return handler
    },
  }
}

describe("MCP tools update_news + fetch_latest_news", () => {
  it("updates entries first, then fetches and marks delivered", async () => {
    const repo = createRepo()
    const serverHarness = createToolServer()
    const config = createConfig()
    const feedUrl = "https://example.com/rss.xml"

    registerUpdateNewsTool(serverHarness.server as any, {
      repository: repo,
      config,
    })
    registerFetchLatestNewsTool(serverHarness.server as any, {
      repository: repo,
      config,
    })

    vi.mocked(fetchRssFeed).mockResolvedValueOnce({
      status: "ok",
      etag: null,
      lastModified: null,
      items: [
        {
          title: "Test Title",
          link: "https://example.com/news/1",
          guid: "news-1",
          isoDate: new Date().toISOString(),
          contentSnippet: "snippet",
        },
      ],
      response: {
        url: feedUrl,
        sourceUrl: feedUrl,
        attemptedUrls: [feedUrl],
        status: 200,
        statusText: "OK",
        contentType: "application/rss+xml",
        contentLength: "100",
        etag: null,
        lastModified: null,
        responsePreview: null,
      },
    })

    const updateResult = await serverHarness.getHandler("update_news")({
      feedUrls: [feedUrl],
    })
    const updatePayload = JSON.parse(updateResult.content[0]!.text) as {
      summary: { insertedTotal: number }
      errors: Array<{ feedUrl: string; message: string }>
      meta?: unknown
    }
    expect(updatePayload.meta).toBeUndefined()
    expect(updatePayload.summary.insertedTotal).toBe(1)
    expect(updatePayload.errors).toEqual([])

    const firstFetchResult = await serverHarness.getHandler("fetch_latest_news")({
      feedUrls: [feedUrl],
      includeDelivered: false,
      limit: 10,
    })
    const firstFetchPayload = JSON.parse(firstFetchResult.content[0]!.text) as {
      items: Array<{ title: string }>
    }
    expect(firstFetchPayload.items).toHaveLength(1)
    expect(firstFetchPayload.items[0]!.title).toBe("Test Title")

    const secondFetchResult = await serverHarness.getHandler("fetch_latest_news")({
      feedUrls: [feedUrl],
      includeDelivered: false,
      limit: 10,
    })
    const secondFetchPayload = JSON.parse(secondFetchResult.content[0]!.text) as {
      items: Array<{ title: string }>
    }
    expect(secondFetchPayload.items).toHaveLength(0)

    repo.close()
  })

  it("does not mark as delivered when markAsRead is false", async () => {
    const repo = createRepo()
    const serverHarness = createToolServer()
    const config = createConfig()
    const feedUrl = "https://example.com/rss.xml"

    registerUpdateNewsTool(serverHarness.server as any, {
      repository: repo,
      config,
    })
    registerFetchLatestNewsTool(serverHarness.server as any, {
      repository: repo,
      config,
    })

    vi.mocked(fetchRssFeed).mockResolvedValueOnce({
      status: "ok",
      etag: null,
      lastModified: null,
      items: [
        {
          title: "Keep Unread",
          link: "https://example.com/news/keep-unread",
          guid: "news-keep-unread",
          isoDate: new Date().toISOString(),
          contentSnippet: "snippet",
        },
      ],
      response: {
        url: feedUrl,
        sourceUrl: feedUrl,
        attemptedUrls: [feedUrl],
        status: 200,
        statusText: "OK",
        contentType: "application/rss+xml",
        contentLength: "100",
        etag: null,
        lastModified: null,
        responsePreview: null,
      },
    })

    await serverHarness.getHandler("update_news")({
      feedUrls: [feedUrl],
    })

    const firstFetchResult = await serverHarness.getHandler("fetch_latest_news")({
      feedUrls: [feedUrl],
      includeDelivered: false,
      markAsRead: false,
      limit: 10,
    })
    const firstFetchPayload = JSON.parse(firstFetchResult.content[0]!.text) as {
      items: Array<{ title: string }>
      markAsRead: boolean
    }
    expect(firstFetchPayload.markAsRead).toBe(false)
    expect(firstFetchPayload.items).toHaveLength(1)

    const secondFetchResult = await serverHarness.getHandler("fetch_latest_news")({
      feedUrls: [feedUrl],
      includeDelivered: false,
      markAsRead: false,
      limit: 10,
    })
    const secondFetchPayload = JSON.parse(secondFetchResult.content[0]!.text) as {
      items: Array<{ title: string }>
    }
    expect(secondFetchPayload.items).toHaveLength(1)

    repo.close()
  })
})
