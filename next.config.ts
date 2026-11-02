import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Stop next dev from writing its own block into AGENTS.md and CLAUDE.md.
  agentRules: false,
  typescript: {
    // Never ship a build that does not typecheck.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
