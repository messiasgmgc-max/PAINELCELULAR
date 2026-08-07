import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      // ── CORS e segurança global ──
      {
        source: "/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          { key: "Access-Control-Max-Age", value: "86400" },
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' *" },
        ],
      },
      // ── Páginas HTML: NUNCA cachear no browser/CDN ──
      {
        source: "/((?!_next/static|_next/image|favicon|manifest|sw\\.js|.*\\.(?:ico|png|svg|jpg|jpeg|gif|webp|woff2?|ttf|otf)).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate, max-age=0",
          },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
      // ── Assets estáticos do Next.js: cache imutável (têm hash no nome) ──
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // ── Service Worker: nunca cachear ──
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { hostname: "images.pexels.com" },
      { hostname: "images.unsplash.com" },
      { hostname: "chat2db-cdn.oss-us-west-1.aliyuncs.com" },
      { hostname: "cdn.chat2db-ai.com" },
    ],
  },
};

export default nextConfig;
