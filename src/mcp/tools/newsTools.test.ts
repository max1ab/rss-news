import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import type { AppConfig } from "../../config.js"
import { fetchRssFeed } from "../../rss/fetcher.js"
import { NewsRepository } from "../../store/repository.js"
import { registerConsumeNewsTool } from "./consumeNews.js"
import { registerCountNewsTool } from "./countNews.js"
import { registerFetchNewsTool } from "./fetchNews.js"
import { registerListSubscriptionsTool } from "./listSubscriptions.js"
import { registerRemoveSubscriptionsTool } from "./removeSubscriptions.js"
import { registerSetConsumptionStatusTool } from "./setConsumptionStatus.js"
import { registerSyncNewsTool } from "./syncNews.js"
import { registerUpsertSubscriptionsTool } from "./upsertSubscriptions.js"

vi.mock("../../rss/fetcher.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../rss/fetcher.js")>()
  return {
    ...actual,
    fetchRssFeed: vi.fn(),
  }
})

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
    defaultFetchLimit: 20,
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

function registerAllTools(serverHarness: ReturnType<typeof createToolServer>, repo: NewsRepository) {
  const config = createConfig()
  registerListSubscriptionsTool(serverHarness.server as any, { repository: repo })
  registerUpsertSubscriptionsTool(serverHarness.server as any, { repository: repo })
  registerRemoveSubscriptionsTool(serverHarness.server as any, { repository: repo })
  registerSyncNewsTool(serverHarness.server as any, { repository: repo, config })
  registerFetchNewsTool(serverHarness.server as any, { repository: repo, config })
  registerConsumeNewsTool(serverHarness.server as any, { repository: repo, config })
  registerCountNewsTool(serverHarness.server as any, { repository: repo, config })
  registerSetConsumptionStatusTool(serverHarness.server as any, { repository: repo, config })
}

describe("MCP tools", () => {
  it("manages subscriptions and syncs before fetch/consume", async () => {
    const repo = createRepo()
    const serverHarness = createToolServer()
    const feedUrl = "https://example.com/rss.xml"

    registerAllTools(serverHarness, repo)

    await serverHarness.getHandler("upsert_subscriptions")({
      items: [{ feedUrl, title: "Example", category: "tech" }],
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

    const syncResult = await serverHarness.getHandler("sync_news")({})
    const syncPayload = JSON.parse(syncResult.content[0]!.text) as {
      summary: { insertedTotal: number }
      results: Array<{ status: string }>
    }
    expect(syncPayload.summary.insertedTotal).toBe(1)
    expect(syncPayload.results[0]!.status).toBe("success")

    const fetchResult = await serverHarness.getHandler("fetch_news")({})
    const fetchPayload = JSON.parse(fetchResult.content[0]!.text) as {
      items: Array<{ title: string; isConsumed: boolean }>
    }
    expect(fetchPayload.items).toHaveLength(1)
    expect(fetchPayload.items[0]!.title).toBe("Test Title")
    expect(fetchPayload.items[0]!.isConsumed).toBe(false)

    const consumeResult = await serverHarness.getHandler("consume_news")({})
    const consumePayload = JSON.parse(consumeResult.content[0]!.text) as {
      items: Array<{ isConsumed: boolean }>
      consumedCount: number
    }
    expect(consumePayload.items).toHaveLength(1)
    expect(consumePayload.items[0]!.isConsumed).toBe(true)
    expect(consumePayload.consumedCount).toBe(1)

    const secondFetchResult = await serverHarness.getHandler("fetch_news")({})
    const secondFetchPayload = JSON.parse(secondFetchResult.content[0]!.text) as {
      items: Array<unknown>
    }
    expect(secondFetchPayload.items).toHaveLength(0)

    repo.close()
  })

  it("returns canonical rsshub feedUrl and requires canonical value for removal", async () => {
    const repo = createRepo()
    const serverHarness = createToolServer()
    const inputFeedUrl = "https://rsshub.app/dcfever/reviews/cameras"
    const canonicalFeedUrl = "rsshub://dcfever/reviews/cameras"

    registerAllTools(serverHarness, repo)

    const upsertResult = await serverHarness.getHandler("upsert_subscriptions")({
      items: [{ feedUrl: inputFeedUrl, category: "tech" }],
    })
    const upsertPayload = JSON.parse(upsertResult.content[0]!.text) as {
      items: Array<{ inputFeedUrl: string; feedUrl: string; status: string }>
    }
    expect(upsertPayload.items).toEqual([
      {
        inputFeedUrl,
        feedUrl: canonicalFeedUrl,
        status: "created",
      },
    ])

    const removeByOriginalResult = await serverHarness.getHandler("remove_subscriptions")({
      feedUrls: [inputFeedUrl],
    })
    const removeByOriginalPayload = JSON.parse(removeByOriginalResult.content[0]!.text) as {
      removedSubscriptions: number
    }
    expect(removeByOriginalPayload.removedSubscriptions).toBe(0)

    const removeByCanonicalResult = await serverHarness.getHandler("remove_subscriptions")({
      feedUrls: [canonicalFeedUrl],
    })
    const removeByCanonicalPayload = JSON.parse(removeByCanonicalResult.content[0]!.text) as {
      removedSubscriptions: number
    }
    expect(removeByCanonicalPayload.removedSubscriptions).toBe(1)

    repo.close()
  })

  it("lists, counts, and resets consumption state", async () => {
    const repo = createRepo()
    const serverHarness = createToolServer()
    const feedUrl = "https://example.com/rss.xml"

    registerAllTools(serverHarness, repo)

    await serverHarness.getHandler("upsert_subscriptions")({
      items: [{ feedUrl, title: "Example", category: "tech" }],
    })

    repo.upsertEntries(feedUrl, [
      {
        id: "entry-1",
        entryUid: "entry-1",
        title: "Already Stored",
        link: "https://example.com/news/1",
        publishedAt: Date.now(),
        contentSnippet: "stored",
      },
    ])

    const listResult = await serverHarness.getHandler("list_subscriptions")({
      category: "tech",
    })
    const listPayload = JSON.parse(listResult.content[0]!.text) as {
      items: Array<{ feedUrl: string }>
    }
    expect(listPayload.items.map((item) => item.feedUrl)).toEqual([feedUrl])

    const countUnread = await serverHarness.getHandler("count_news")({
      pastHours: 24,
    })
    const countUnreadPayload = JSON.parse(countUnread.content[0]!.text) as {
      totalCount: number
    }
    expect(countUnreadPayload.totalCount).toBe(1)

    const today = new Date().toISOString().slice(0, 10)
    const markConsumed = await serverHarness.getHandler("set_consumption_status")({
      startDate: today,
      endDate: today,
      status: "consumed",
    })
    const markConsumedPayload = JSON.parse(markConsumed.content[0]!.text) as {
      changedDeliveries: number
    }
    expect(markConsumedPayload.changedDeliveries).toBe(1)

    const countConsumed = await serverHarness.getHandler("count_news")({
      pastHours: 24,
      includeConsumed: true,
    })
    const countConsumedPayload = JSON.parse(countConsumed.content[0]!.text) as {
      totalCount: number
    }
    expect(countConsumedPayload.totalCount).toBe(1)

    const markUnconsumed = await serverHarness.getHandler("set_consumption_status")({
      startDate: today,
      endDate: today,
      status: "unconsumed",
    })
    const markUnconsumedPayload = JSON.parse(markUnconsumed.content[0]!.text) as {
      changedDeliveries: number
    }
    expect(markUnconsumedPayload.changedDeliveries).toBe(1)

    repo.close()
  })

  it("removes subscriptions and can purge stored data", async () => {
    const repo = createRepo()
    const serverHarness = createToolServer()
    const feedUrl = "https://example.com/rss.xml"

    registerAllTools(serverHarness, repo)

    await serverHarness.getHandler("upsert_subscriptions")({
      items: [{ feedUrl }],
    })
    repo.upsertEntries(feedUrl, [
      {
        id: "entry-1",
        entryUid: "entry-1",
        title: "Stored",
        link: "https://example.com/news/1",
        publishedAt: Date.now(),
        contentSnippet: "stored",
      },
    ])
    repo.markDelivered(feedUrl, ["entry-1"], Date.now())

    const removeResult = await serverHarness.getHandler("remove_subscriptions")({
      feedUrls: [feedUrl],
      mode: "purge",
    })
    const removePayload = JSON.parse(removeResult.content[0]!.text) as {
      removedSubscriptions: number
      removedEntries: number
      removedDeliveries: number
    }
    expect(removePayload.removedSubscriptions).toBe(1)
    expect(removePayload.removedEntries).toBe(1)
    expect(removePayload.removedDeliveries).toBe(1)

    const listResult = await serverHarness.getHandler("list_subscriptions")({})
    const listPayload = JSON.parse(listResult.content[0]!.text) as {
      items: Array<unknown>
    }
    expect(listPayload.items).toHaveLength(0)

    repo.close()
  })
})
