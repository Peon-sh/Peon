import type { Metadata } from "next"
import { Suspense } from "react"
import { Archivo, IBM_Plex_Mono, Inter } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { QueryProvider } from "@/providers/QueryProvider"
import { GoogleProvider } from "@/providers/GoogleProvider"
import { AuthProvider } from "@/providers/AuthProvider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-archivo",
})

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
})

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
      className={cn("antialiased", archivo.variable, plexMono.variable, inter.variable)}
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
