import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"

import "./globals.css"

export const metadata: Metadata = {
  title: "Aspen OS",
  description:
    "The simplest and most enjoyable project operating system for nonprofit and community organizations.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
