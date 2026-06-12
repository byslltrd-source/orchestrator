import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Add security headers in production via middleware or here if desired
  // images: { remotePatterns: [...] },
  // experimental: { ... },
};

export default nextConfig;
