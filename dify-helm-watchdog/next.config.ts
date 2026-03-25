// next.config.js
import type { NextConfig } from "next";
import { codeInspectorPlugin } from "code-inspector-plugin";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Keep dev and production artifacts separate so local `next build`
  // does not corrupt a running `next dev` session.
  distDir: isDev ? ".next-dev" : ".next",
  ...(isDev
    ? {
        turbopack: {
          rules: codeInspectorPlugin({
            bundler: "turbopack",
          }),
        },
      }
    : {}),
};

export default nextConfig;
