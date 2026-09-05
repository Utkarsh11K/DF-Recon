import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Produces a self-contained `.next/standalone` build (server + only the
  // node_modules actually needed at runtime) so the production Docker image
  // can stay small and doesn't need the full node_modules tree copied in.
  output: 'standalone',
};

export default nextConfig;
