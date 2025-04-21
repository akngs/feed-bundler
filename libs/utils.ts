import showdown from "showdown"

export function md2html(md: string, stripSinglelineOuterBlock = false): string {
  const conv = new showdown.Converter({ simpleLineBreaks: true })
  conv.setFlavor("github")
  const html = conv.makeHtml(md.trim())
  return stripSinglelineOuterBlock && md.trim().indexOf("\n") === -1
    ? html.replace("<p>", "").replace("</p>", "")
    : html
}
