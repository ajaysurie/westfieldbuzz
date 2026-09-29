import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Next 16.3 caches Turbopack's build output on disk by default, and Vercel
    // restores that cache before each build. On 2026-09-29 the deploy of #27
    // (the /subscribe page) reused the previous build's compiled stylesheet
    // with the new page code, so the page shipped unstyled. Compiling from
    // source every time costs a few seconds and cannot serve a stale bundle.
    turbopackFileSystemCacheForBuild: false,
  },
  serverExternalPackages: ["firebase-admin", "node-ical"],
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: "https://westfieldbuzz.firebaseapp.com/__/auth/:path*",
      },
    ];
  },
};

export default nextConfig;
