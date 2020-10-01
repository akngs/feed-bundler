import Head from "next/head"
import React from "react"

type Props = {
  children: React.ReactElement[] | React.ReactElement
  title?: string
}

const Layout = ({ children, title = "Feed bundler" }: Props): React.ReactElement => {
  return (
    <div>
      <Head>
        <title>{title}</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="initial-scale=1.0, width=device-width" />
      </Head>
      {children}
    </div>
  )
}

export default Layout
