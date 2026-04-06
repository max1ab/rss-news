import type { AppConfig } from "../../config.js"
import type { NewsRepository, StoredEntry } from "../../store/repository.js"

export function formatDate(timestamp: number | null) {
  if (!timestamp) return null
  return new Date(timestamp).toISOString().slice(0, 10)
}

export function mapEntryForTool(entry: StoredEntry) {
  return {
    feedUrl: entry.feedUrl,
    entryUid: entry.entryUid,
    title: entry.title,
    link: entry.link,
    publishedAt: formatDate(entry.publishedAt),
    firstSeenAt: formatDate(entry.firstSeenAt),
    contentSnippet: entry.contentSnippet,
    isConsumed: entry.isDelivered,
  }
}

export function resolveToolFeedUrls(args: {
  repository: NewsRepository
  config: AppConfig
  feedUrls?: string[]
  category?: string | null
}) {
  const resolvedFeedUrls = args.repository.resolveSubscribedFeedUrls({
    feedUrls: args.feedUrls,
    category: args.category,
  })

  if (resolvedFeedUrls.length === 0) {
    throw new Error("No subscribed feeds matched the request. Add subscriptions first.")
  }

  if (resolvedFeedUrls.length > args.config.maxFeedUrlsPerRequest) {
    throw new Error(`feedUrls exceed configured max: ${args.config.maxFeedUrlsPerRequest}`)
  }

  return resolvedFeedUrls
}
