import { aggregateFeeds, FeedDef, toXml } from "./tools/feeds"
import yaml from "js-yaml"
import { promises as fs } from "fs"

const MAX_AGE_IN_DAYS = 3
const URL = "https://akngs.github.io/feed-bundler/"

async function main(): Promise<void> {
  const feedDefs = yaml.safeLoad(await fs.readFile("feed-defs.yaml", "utf-8")) as FeedDef[]
  const promises = feedDefs.slice(0, 1).map(async (d) => {
    const feed = await aggregateFeeds(URL, d, new Date(), MAX_AGE_IN_DAYS)
    const xml = toXml(feed)
    await fs.writeFile(`docs/${d.feedId}.xml`, xml, "utf-8")
  })
  await Promise.all(promises)
}

main().then()
