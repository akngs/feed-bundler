import Bottleneck from "bottleneck"
import { Feed } from "feed"
import Parser from "rss-parser"

export type FeedDef = {
  feedId: string
  title: string
  description: string
  sources: FeedSource[]
}

export type FeedSource = {
  url: string
  filters: string[]
}

type ParserOutput = Parser.Output & {
  items: Parser.Item[]
}

export async function fetchFeed(source: FeedSource): Promise<ParserOutput | null> {
  try {
    const parser = new Parser()
    const output = await parser.parseURL(source.url)
    const items = filterItems(output.items || [], source.filters)
    return { ...output, items }
  } catch (e) {
    console.log(e)
    return null
  }
}

export async function aggregateFeeds(
  baseUrl: string,
  def: FeedDef,
  now: Date,
  maxAgeInDays: number,
): Promise<ParserOutput> {
  // rate-limit concurrent HTTP requests
  const limiter = new Bottleneck({ maxConcurrent: 10, minTime: 100 })
  const tasks = def.sources.map((source) => limiter.schedule(fetchFeed, source))

  // fetch all feeds
  const feeds = (await Promise.all(tasks)).filter(isNotNull)

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
  return {
    id: def.feedId,
    feedUrl: `${baseUrl}${def.feedId}`,
    title: def.title,
    description: def.description,
    items,
  }
}

export function toXml(feed: ParserOutput): string {
  const gen = new Feed({
    id: feed.id ?? "",
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

export function filterItems(items: Parser.Item[], rawFilters: string[]): Parser.Item[] {
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

export function validateFeedDef(def: Record<string, unknown>): FeedDef {
  return {
    feedId: String(def.feedId ?? ""),
    title: String(def.title ?? ""),
    description: String(def.description ?? ""),
    sources: ((def.sources ?? []) as Record<string, unknown>[]).map(validateFeedSource),
  }
}

function validateFeedSource(src: Record<string, unknown>): FeedSource {
  return {
    url: String(src.url ?? ""),
    filters: ((src.filters ?? []) as unknown[]).map(String),
  }
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null
}
