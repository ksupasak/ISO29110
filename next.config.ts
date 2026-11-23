import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Overridable so e2e runs (.next-e2e) never share a build directory with a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  experimental: { serverActions: { bodySizeLimit: "55mb" }, proxyClientMaxBodySize: "55mb" },
  sassOptions: {
    // Bootstrap 5.3 still uses @import and global Sass built-ins; keep the build output free of its deprecation noise.
    quietDeps: true,
    silenceDeprecations: ["import", "global-builtin", "color-functions", "if-function"],
  },
};

export default nextConfig;
