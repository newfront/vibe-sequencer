import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev badge sits on top of the status bar in a full-viewport app.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
