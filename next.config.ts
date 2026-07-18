import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // ssh2 ships native crypto assets that Turbopack cannot place in ESM chunks.
  serverExternalPackages: ["ssh2", "node-ssh"],
}

export default nextConfig
