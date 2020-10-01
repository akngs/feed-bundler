import Bottleneck from "bottleneck"
import Parser from "rss-parser"

const urls: string[] = `
  https://github.com/vercel/next.js/releases.atom
  https://github.com/TypeStrong/ts-node/releases.atom
  https://github.com/mingrammer/diagrams/releases.atom
  https://github.com/nanomsg/nng/releases.atom
  https://github.com/vercel/swr/releases.atom
  https://github.com/mikecao/umami/releases.atom
  https://github.com/google-research/bert/releases.atom
  https://github.com/immerjs/immer/releases.atom
  https://github.com/gsquire/topngx/releases.atom
  https://github.com/vaexio/vaex/releases.atom
  https://github.com/golang/go/releases.atom
  https://github.com/denoland/deno/releases.atom
  https://github.com/romefrontend/rome/releases.atom
  https://github.com/ish-app/ish/releases.atom
  https://github.com/remarkjs/remark/releases.atom
  https://github.com/stdlib-js/stdlib/releases.atom
  https://github.com/davidkpiano/xstate/releases.atom
  https://github.com/cube-js/cube.js/releases.atom
  https://github.com/google/filament/releases.atom
  https://github.com/sveltejs/svelte/releases.atom
  https://github.com/3b1b/manim/releases.atom
  https://github.com/faastjs/faast.js/releases.atom
  https://github.com/mdn/browser-compat-data/releases.atom
  https://github.com/enkimute/ganja.js/releases.atom
  https://github.com/cdr/code-server/releases.atom
  https://github.com/apache/arrow/releases.atom
`
  .trim()
  .split("\n")
  .map((url) => url.trim())

export async function fetchFeed(url: string): Promise<Parser.Output> {
  const parser = new Parser()
  return await parser.parseURL(url)
}

export async function aggregateFeeds(
  title: string,
  now: Date,
  urls: string[],
): Promise<Parser.Output> {
  // rate-limit concurrent HTTP requests
  const limiter = new Bottleneck({ maxConcurrent: 10, minTime: 100 })
  const tasks = urls.map((url) => limiter.schedule(fetchFeed, url))

  // fetch all feeds
  const feeds = await Promise.all(tasks)

  // merge and sort items
  const items: Parser.Item[] = []
  const expireLimit = +now - 3 * 24 * 60 * 60 * 1000
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
    title,
    items,
  }
}

async function main() {
  const feed = await aggregateFeeds("Release notes", new Date(), urls)
  console.log(feed)
}

main().then()
