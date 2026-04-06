import Parser from "rss-parser"

export interface FeedFetchState {
  etag: string | null
  lastModified: string | null
}

const RSSHUB_PROTOCOL = "rsshub://"
const RSSHUB_FALLBACK_BASES = [
  "https://rsshub.app",
  "https://rsshub.rssforever.com",
  "https://rsshub.feeded.xyz",
  "https://hub.slarker.me",
  "https://rsshub.liumingye.cn",
  "https://rsshub-instance.zeabur.app",
  "https://rss.fatpandac.com",
  "https://rsshub.pseudoyu.com",
  "https://rsshub.friesport.ac.cn",
  "https://rsshub.atgw.io",
  "https://rsshub.rss.tips",
  "https://rsshub.mubibai.com",
  "https://rsshub.ktachibana.party",
  "https://rsshub.woodland.cafe",
  "https://rsshub.aierliz.xyz",
] as const

const RSSHUB_FALLBACK_ORIGINS = new Set(
  RSSHUB_FALLBACK_BASES.map((base) => new URL(base).origin.toLowerCase()),
)

export function normalizeRssHubUrl(feedUrl: string) {
  if (feedUrl.startsWith(RSSHUB_PROTOCOL)) {
    return feedUrl
  }

  let url: URL
  try {
    url = new URL(feedUrl)
  } catch {
    return feedUrl
  }

  if (!RSSHUB_FALLBACK_ORIGINS.has(url.origin.toLowerCase())) {
    return feedUrl
  }

  const route = `${url.pathname}${url.search}`.replace(/^\/+/, "")
  if (!route) {
    return feedUrl
  }

  return `${RSSHUB_PROTOCOL}${route}`
}

export function expandRssHubUrls(feedUrl: string) {
  const normalizedFeedUrl = normalizeRssHubUrl(feedUrl)
  if (!normalizedFeedUrl.startsWith(RSSHUB_PROTOCOL)) {
    return [normalizedFeedUrl]
  }

  const route = normalizedFeedUrl.slice(RSSHUB_PROTOCOL.length).replace(/^\/+/, "")
  if (!route) {
    throw new Error(`Invalid rsshub url: ${normalizedFeedUrl}`)
  }

  return RSSHUB_FALLBACK_BASES.map((base) => `${base}/${route}`)
}

export interface FeedResponseInfo {
  url: string
  sourceUrl: string
  attemptedUrls: string[]
  status: number
  statusText: string
  contentType: string | null
  contentLength: string | null
  etag: string | null
  lastModified: string | null
  responsePreview: string | null
}

export type FeedFetchResult =
  | {
      status: "not_modified"
      etag: string | null
      lastModified: string | null
      items: Parser.Item[]
      response: FeedResponseInfo
    }
  | {
      status: "ok"
      etag: string | null
      lastModified: string | null
      items: Parser.Item[]
      response: FeedResponseInfo
    }

export async function fetchRssFeed({
  feedUrl,
  previousState,
  timeoutMs,
  userAgent,
  debugResponsePreviewLength = 0,
  onDebug,
}: {
  feedUrl: string
  previousState: FeedFetchState | null
  timeoutMs: number
  userAgent: string
  debugResponsePreviewLength?: number
  onDebug?: (message: string, detail?: unknown) => void
}): Promise<FeedFetchResult> {
  const headers: Record<string, string> = {
    "user-agent": userAgent,
    accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  }

  if (previousState?.etag) {
    headers["if-none-match"] = previousState.etag
  }
  if (previousState?.lastModified) {
    headers["if-modified-since"] = previousState.lastModified
  }

  const candidateUrls = expandRssHubUrls(feedUrl)
  const attemptedUrls: string[] = []
  const errors: string[] = []

  for (const candidateUrl of candidateUrls) {
    attemptedUrls.push(candidateUrl)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let response: Response
    try {
      onDebug?.("rss.request.start", {
        feedUrl,
        candidateUrl,
        timeoutMs,
        headers,
      })
      response = await fetch(candidateUrl, {
        headers,
        signal: controller.signal,
        redirect: "follow",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${candidateUrl}: ${message}`)
      onDebug?.("rss.request.error", { feedUrl, candidateUrl, error: message })
      continue
    } finally {
      clearTimeout(timer)
    }

    const etag = response.headers.get("etag")
    const lastModified = response.headers.get("last-modified")
    const contentType = response.headers.get("content-type")
    const contentLength = response.headers.get("content-length")
    const responseInfoBase = {
      url: response.url || candidateUrl,
      sourceUrl: candidateUrl,
      attemptedUrls: [...attemptedUrls],
      status: response.status,
      statusText: response.statusText,
      contentType,
      contentLength,
      etag: etag ?? null,
      lastModified: lastModified ?? null,
    }

    onDebug?.("rss.response.meta", responseInfoBase)

    if (response.status === 304) {
      const responseInfo: FeedResponseInfo = {
        ...responseInfoBase,
        responsePreview: null,
      }
      return {
        status: "not_modified",
        etag: etag ?? previousState?.etag ?? null,
        lastModified: lastModified ?? previousState?.lastModified ?? null,
        items: [],
        response: responseInfo,
      }
    }

    if (!response.ok) {
      const msg = `${candidateUrl}: ${response.status} ${response.statusText}`
      errors.push(msg)
      onDebug?.("rss.response.non_ok", { feedUrl, candidateUrl, status: response.status })
      continue
    }

    const xml = await response.text()
    const responsePreview =
      debugResponsePreviewLength > 0
        ? xml.slice(0, debugResponsePreviewLength).replaceAll(/\s+/g, " ").trim()
        : null
    const responseInfo: FeedResponseInfo = {
      ...responseInfoBase,
      responsePreview,
    }

    onDebug?.("rss.response.body", {
      feedUrl,
      candidateUrl,
      bodyLength: xml.length,
      responsePreview,
    })

    try {
      const parser = new Parser()
      const parsed = await parser.parseString(xml)
      onDebug?.("rss.response.parsed", {
        feedUrl,
        candidateUrl,
        itemCount: parsed.items?.length ?? 0,
        sampleTitles: (parsed.items ?? []).slice(0, 3).map((item) => item.title ?? "(untitled)"),
      })

      return {
        status: "ok",
        etag: etag ?? null,
        lastModified: lastModified ?? null,
        items: parsed.items ?? [],
        response: responseInfo,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${candidateUrl}: parse failed: ${message}`)
      onDebug?.("rss.response.parse_error", {
        feedUrl,
        candidateUrl,
        error: message,
      })
    }
  }

  throw new Error(`Failed to fetch RSS feed ${feedUrl}. Attempts: ${errors.join(" | ")}`)
}
