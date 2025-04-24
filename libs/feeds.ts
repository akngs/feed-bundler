import { md2html } from "./utils.ts"
import Bottleneck from "bottleneck"
import { shuffle } from "d3"
import dedent from "dedent"
import dotenv from "dotenv"
import { Feed } from "feed"
import { nanoid } from "nanoid"
import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"
import Parser from "rss-parser"
import { z } from "zod"

dotenv.config()

const OPENAI_BASE_URLS = {
  google: "https://generativelanguage.googleapis.com/v1beta/openai/",
  openai: "https://api.openai.com/v1/",
}

const API_KEYS = {
  google: process.env.GEMINI_API_KEY ?? "",
  openai: process.env.OPENAI_API_KEY ?? "",
}

export const FeedSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("llm"),
    title: z.string(),
    provider: z.enum(["google", "openai"]),
    model: z.string(),
    systemPrompt: z.string(),
    userPrompt: z.string(),
    temperature: z.number().default(1.0),
    noises: z.array(z.string()).default([]),
    nNoises: z.number().default(3),
  }),
  z.object({
    type: z.literal("feed"),
    url: z.string(),
    filters: z.array(z.string()).default([]),
  }),
])

export type FeedSource = z.infer<typeof FeedSourceSchema>

export const FeedDefSchema = z.object({
  feedId: z.string(),
  title: z.string(),
  description: z.string(),
  sources: z.array(FeedSourceSchema),
})

export type FeedDef = z.infer<typeof FeedDefSchema>

type ParserOutput = Parser.Output<Parser.Item>

const GeneratedFeedItemSchema = z.object({
  title: z.string(),
  content: z.string(),
})

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
  const tasks = def.sources.map((source) => limiter.schedule(getFeedFromSource, source))

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

async function getFeedFromSource(source: FeedSource): Promise<ParserOutput | null> {
  if (source.type === "llm") {
    return getFeedFromLlm(source)
  } else if (source.type === "feed") {
    return getFeedFromUrl(source)
  } else {
    throw new Error(`Cannot reach here`)
  }
}

async function getFeedFromLlm(source: FeedSource & { type: "llm" }): Promise<ParserOutput | null> {
  const systemPrompt = dedent`
    ${source.systemPrompt}

    Output format:

    - title: Concise and descriptive title
    - content: The article written in markdown

    Metadata:

    - current date and time: ${new Date().toISOString()}
    `

  const noises = shuffle(source.noises).slice(0, source.nNoises)
  const userPrompt = source.userPrompt.replace("[[noises]]", noises.join(", "))
  console.log(userPrompt)

  const openai = new OpenAI({
    apiKey: API_KEYS[source.provider],
    baseURL: OPENAI_BASE_URLS[source.provider],
  })
  const res = await openai.beta.chat.completions.parse({
    model: source.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: source.temperature,
    response_format: zodResponseFormat(GeneratedFeedItemSchema, "generated_feed_item"),
  })

  const item = res.choices[0]!.message.parsed
  if (!item) return null

  const date = new Date().toISOString()
  const guid = nanoid(64)

  return {
    link: `https://github.com/akngs/feed-bundler`,
    feedUrl: "https://github.com/akngs/feed-bundler",
    title: source.title,
    items: [
      {
        title: item.title,
        link: `https://github.com/akngs/feed-bundler?guid=${guid}`,
        content: md2html(item.content),
        creator: `${source.provider}/${source.model}`,
        guid,
        pubDate: date,
        isoDate: date,
      },
    ],
  }
}

async function getFeedFromUrl(source: FeedSource & { type: "feed" }): Promise<ParserOutput | null> {
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
