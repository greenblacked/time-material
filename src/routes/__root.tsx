import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const APP_NAME = "Time Material";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Compare a working day across cities and set it against your Google Calendar, including the Zoom calls already on it.",
      },
      { name: "theme-color", content: "#f5f7fb" },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__Time/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__Time/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
