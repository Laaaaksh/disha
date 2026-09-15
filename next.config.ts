import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't let a cosmetic ESLint error (e.g. an unescaped apostrophe in JSX)
  // fail a production build/deploy — lint still runs in dev and CI.
  eslint: { ignoreDuringBuilds: true },
  // /api/disha reads these curated data files with fs at runtime; on a
  // serverless host (e.g. Vercel) they must be traced into the function
  // bundle or the read ENOENTs. Keeps the Disha slice deployable.
  outputFileTracingIncludes: {
    "/api/disha": ["./data/catalogue.json", "./data/jobs.json", "./data/demo-plans.json"],
  },
  // These ship native bindings (better-sqlite3), bundle badly under webpack's
  // RSC layer (pdf-parse/pdfjs-dist's exports interop), or resolve assets
  // through their own on-disk package layout at runtime (playwright's driver
  // and browser registry, mermaid's bundle, katex's CSS + fonts) — keep them
  // as real Node `require`s instead of trying to bundle them.
  serverExternalPackages: [
    "better-sqlite3",
    "pdf-parse",
    "pdfjs-dist",
    "mammoth",
    "@xenova/transformers",
    "onnxruntime-node",
    "sharp",
    "playwright",
    "mermaid",
    "katex",
  ],
  // The video render pipeline writes narration WAVs and per-scene frames/MP4s
  // to data/video-cache (lib/video/paths.ts) and job output to data/generated —
  // both inside the project root, which webpack's dev file watcher covers by
  // default. Without excluding them, a render running alongside `next dev`
  // triggers a continuous recompile loop (one per file written), which was
  // observed to intermittently 404 dynamic API routes like
  // /api/video/[jobId] mid-request ("Cannot find module for page" /
  // PageNotFoundError) while a recompile was in flight. Excluding data/ from
  // the watch keeps dev-server routing stable while a lesson renders.
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/node_modules/**", "**/data/**"],
    };
    return config;
  },
};

export default nextConfig;
