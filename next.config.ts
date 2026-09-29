import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output — a self-contained server.js plus only the
  // node_modules actually traced as used, so the Docker runtime image
  // doesn't need to carry the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
