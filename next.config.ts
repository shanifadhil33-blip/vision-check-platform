import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Never ship a build that does not typecheck.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
