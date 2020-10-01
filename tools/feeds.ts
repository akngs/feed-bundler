import Bottleneck from "bottleneck"
import { Feed } from "feed"
import Parser from "rss-parser"

export type FeedDef = {
  feedId: string
  title: string
  description: string
  urls: string[]
}

export async function fetchFeed(url: string): Promise<Parser.Output> {
  const parser = new Parser()
  return await parser.parseURL(url)
}

export async function aggregateFeeds(
  baseUrl: string,
  def: FeedDef,
  now: Date,
  maxAgeInDays: number,
): Promise<Parser.Output> {
  // rate-limit concurrent HTTP requests
  const limiter = new Bottleneck({ maxConcurrent: 10, minTime: 100 })
  const tasks = def.urls.map((url) => limiter.schedule(fetchFeed, url))

  // fetch all feeds
  const feeds = await Promise.all(tasks)

  // merge and sort items
  const items: Parser.Item[] = []
  const expireLimit = +now - maxAgeInDays * 24 * 60 * 60 * 1000
  feeds.forEach((feed) => {
    const newItems = (feed.items || []).filter((item) => +new Date(item.isoDate || 0) > expireLimit)
    newItems.forEach((item) =>
      items.push({
        ...item,
        title: `${feed.title}: ${item.title}`,
      }),
    )
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

export function toXml(feed: Parser.Output): string {
  const gen = new Feed({
    id: feed.id || "",
    link: feed.feedUrl || "",
    title: feed.title || "",
    description: feed.description || "",
    copyright: "N/A",
  })

  const items = feed.items || []
  items.forEach((item) => {
    gen.addItem({
      title: item.title || "",
      link: item.link || "",
      date: new Date(item.isoDate || ""),
      content: item.content,
    })
  })

  return gen.rss2()
}
