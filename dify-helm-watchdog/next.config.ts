// next.config.js
import type { NextConfig } from "next";
import { codeInspectorPlugin } from "code-inspector-plugin";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
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