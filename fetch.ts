import { aggregateFeeds, FeedDefSchema } from "./tools/feeds.ts"
import yaml from "js-yaml"
import * as fs from "node:fs/promises"

const MAX_AGE_IN_DAYS = 3
const URL = "https://akngs.github.io/feed-bundler/"

async function main(): Promise<void> {
  // Load feed definitions
  const defs = FeedDefSchema.array().parse(yaml.load(await fs.readFile("feed-defs.yaml", "utf-8")))

  // Fetch and save feeds
  await Promise.all(
    defs.map(async (def) => {
      const xml = await aggregateFeeds(URL, def, new Date(), MAX_AGE_IN_DAYS)
      await fs.writeFile(`docs/${def.feedId}.xml`, xml, "utf-8")
    }),
  )
}

main().then()
