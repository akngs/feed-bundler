import Bottleneck from "bottleneck"
import { Feed } from "feed"
import Parser from "rss-parser"
import { z } from "zod"

export const FeedSourceSchema = z.object({
  url: z.string(),
  filters: z.array(z.string()).default([]),
})

export type FeedSource = z.infer<typeof FeedSourceSchema>

export const FeedDefSchema = z.object({
  feedId: z.string(),
  title: z.string(),
  description: z.string(),
  sources: z.array(FeedSourceSchema),
})

export type FeedDef = z.infer<typeof FeedDefSchema>

type ParserOutput = Parser.Output<Parser.Item>

/**
 * Aggregates feeds from multiple sources into a single feed.
 *
 * @param baseUrl - The base URL of the feed.
 * @param def - The feed definition.
 * @param now - The current date.
 * @param maxAgeInDays - The maximum age of the feed in days.
 * @returns The aggregated feed as an XML string.
 */
export async function aggregateFeeds(
  baseUrl: string,
  def: FeedDef,
  now: Date,
  maxAgeInDays: number,
): Promise<string> {
  // rate-limit concurrent HTTP requests
  const limiter = new Bottleneck({ maxConcurrent: 10, minTime: 100 })
  const tasks = def.sources.map((source) => limiter.schedule(fetchFeed, source))

  // fetch all feeds
  const feeds = (await Promise.all(tasks)).filter((d) => d !== null)

  // merge and sort items
  const items: Parser.Item[] = []
  const expireLimit = +now - maxAgeInDays * 24 * 60 * 60 * 1000
  feeds.forEach((f) => {
    const newItems = f.items.filter((i) => +new Date(i.isoDate ?? 0) > expireLimit)
    newItems.forEach((i) => items.push({ ...i, title: `${f.title}: ${i.title}` }))
  })
  items.sort((a, b) => {
    const aDate = +new Date(a.isoDate || 0)
    const bDate = +new Date(b.isoDate || 0)
    return aDate > bDate ? -1 : aDate < bDate ? 1 : 0
  })

  // done
  return toXml(def.feedId, {
    feedUrl: `${baseUrl}${def.feedId}`,
    title: def.title,
    description: def.description,
    items,
  })
}

function toXml(id: string, feed: ParserOutput): string {
  const gen = new Feed({
    id,
    link: feed.feedUrl ?? "",
    title: feed.title ?? "",
    description: feed.description ?? "",
    copyright: "N/A",
  })

  feed.items.forEach((i) => {
    gen.addItem({
      title: i.title ?? "",
      link: i.link ?? "",
      date: new Date(i.isoDate ?? ""),
      content: i.content,
    })
  })

  return gen.rss2()
}

async function fetchFeed(source: FeedSource): Promise<ParserOutput | null> {
  try {
    const parser = new Parser()
    const output = await parser.parseURL(source.url)
    const items = filterItems(output.items, source.filters)
    return { ...output, items }
  } catch {
    return null
  }
}

function filterItems(items: Parser.Item[], rawFilters: string[]): Parser.Item[] {
  const filters = rawFilters.map((f) => ({
    negative: f.startsWith("! "),
    pattern: new RegExp(f.startsWith("! ") ? f.substring(2) : f),
  }))

  return items.filter((item) => {
    const text = [item.title, item.contentSnippet, item.content].filter((d) => !!d).join(" ")
    if (!text) return false
    return filters.every((f) => (f.negative ? !f.pattern.test(text) : f.pattern.test(text)))
  })
}
