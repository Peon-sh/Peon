import type { Metadata } from "next"
import { Suspense } from "react"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { QueryProvider } from "@/providers/QueryProvider"
import { GoogleProvider } from "@/providers/GoogleProvider"
import { AuthProvider } from "@/providers/AuthProvider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  title: "Peon",
  description: "Self-hostable application deployment platform",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", geistSans.variable, geistMono.variable)}
    >
      <body>
        <ThemeProvider>
          <QueryProvider>
            <GoogleProvider>
              <TooltipProvider>
                <Suspense fallback={null}>
                  <AuthProvider>{children}</AuthProvider>
                </Suspense>
                <Toaster richColors position="top-right" />
              </TooltipProvider>
            </GoogleProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
