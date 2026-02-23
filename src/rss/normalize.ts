import { createHash, randomUUID } from "node:crypto"

import type Parser from "rss-parser"

export interface NormalizedEntry {
  id: string
  entryUid: string
  title: string
  link: string | null
  publishedAt: number | null
  contentSnippet: string | null
}

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || value.trim().length === 0) return null
  const ts = Date.parse(value)
  return Number.isNaN(ts) ? null : ts
}

function normalizeLink(link: string) {
  try {
    const url = new URL(link)
    url.hash = ""
    return url.toString()
  } catch {
    return link
  }
}

function shortHash(input: string) {
  return createHash("sha256").update(input).digest("hex").slice(0, 32)
}

export function createEntryUid(params: {
  feedUrl: string
  guid?: string | null
  link?: string | null
  title?: string | null
  contentSnippet?: string | null
  publishedAt?: number | null
}) {
  const guid = params.guid?.trim()
  if (guid) {
    return shortHash(`guid|${params.feedUrl}|${guid}`)
  }

  const normalizedLink = params.link ? normalizeLink(params.link) : null
  if (normalizedLink) {
    return shortHash(`link|${params.feedUrl}|${normalizedLink}`)
  }

  return shortHash(
    [
      "fallback",
      params.feedUrl,
      params.title?.trim() || "",
      params.contentSnippet?.trim() || "",
      params.publishedAt ?? "",
    ].join("|"),
  )
}

export function normalizeFeedItems(feedUrl: string, items: Parser.Item[]): NormalizedEntry[] {
  return items
    .map((item) => {
      const title = toText(item.title) ?? "(untitled)"
      const link = toText(item.link)
      const contentSnippet =
        toText(item.contentSnippet) ?? toText(item.content) ?? toText(item.summary)
      const guid = toText(item.guid) ?? toText((item as { id?: string }).id)
      const publishedAt = toTimestamp(item.isoDate) ?? toTimestamp(item.pubDate)

      return {
        id: randomUUID(),
        entryUid: createEntryUid({
          feedUrl,
          guid,
          link,
          title,
          contentSnippet,
          publishedAt,
        }),
        title,
        link,
        publishedAt,
        contentSnippet,
      } satisfies NormalizedEntry
    })
    .filter((item) => item.title.length > 0)
}
