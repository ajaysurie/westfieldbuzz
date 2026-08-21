import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
