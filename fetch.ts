import { aggregateFeeds, validateFeedDef, toXml } from "./tools/feeds.ts"
import yaml from "js-yaml"
import { promises as fs } from "fs"

const MAX_AGE_IN_DAYS = 3
const URL = "https://akngs.github.io/feed-bundler/"

async function main(): Promise<void> {
  const raw = await fs.readFile("feed-defs.yaml", "utf-8")
  const feedDefs = (yaml.load(raw) as Record<string, unknown>[]).map(validateFeedDef)
  await Promise.all(
    feedDefs.map(async (d) => {
      const feed = await aggregateFeeds(URL, d, new Date(), MAX_AGE_IN_DAYS)
      const xml = toXml(d.feedId, feed)
      await fs.writeFile(`docs/${d.feedId}.xml`, xml, "utf-8")
    }),
  )
}

main().then()
