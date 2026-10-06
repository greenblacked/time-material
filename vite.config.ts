import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { timePwaPlugin } from "./scripts/time-pwa-plugin.mjs";

// The local development server listens on port 8080.
const cloudflareTarget = process.env.DEPLOY_TARGET === "cloudflare";

export default defineConfig(({ command, isPreview }) => ({
  define: {
    "import.meta.env.DEPLOY_TARGET": JSON.stringify(cloudflareTarget ? "cloudflare" : "node"),
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    // The preview proxy forwards its own host name. Without this, Vite
    // answers 403 and the pane stays blank.
    allowedHosts: ["time-material-review.orb.local", "time-material-dev.orb.local"],
    headers: {
      "Cache-Control": "no-store",
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    ...(!cloudflareTarget ? [] : [cloudflare({ viteEnvironment: { name: "ssr" } })]),
    // Supplies the build-time OG identity and dev-only PWA middleware.
    timePwaPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(!cloudflareTarget && (command === "build" || isPreview)
      ? [
          nitro({
            preset: "vercel",
            // Auto-registers server/middleware/* (the PWA install page +
            // manifest + head-tag middleware). Nitro v3 defaults serverDir to
            // false, so removing this silently unwires /?install=1 on deploys.
            serverDir: "./server",
          }),
        ]
      : []),
    viteReact(),
  ],
}));
