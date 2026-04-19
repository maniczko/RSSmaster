import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(process.cwd(), "../.."),
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
