import timePwaMiddleware from "../server/middleware/time-pwa";

/** Native Worker entry; keep the deployed PWA middleware without a Nitro runtime. */
export default {
  async fetch(
    request: Request,
    env: { ROBOTS?: string; CF_VERSION_METADATA?: { id: string } },
  ): Promise<Response> {
    const noindex = env.ROBOTS === "noindex";
    const metadataHeaders: Record<string, string> = env.CF_VERSION_METADATA?.id
      ? { "X-Worker-Version": env.CF_VERSION_METADATA.id }
      : {};
    if (new URL(request.url).pathname === "/robots.txt") {
      return new Response(noindex ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nAllow: /\n", {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          ...metadataHeaders,
          ...(noindex ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
        },
      });
    }
    const result = await timePwaMiddleware(
      { url: new URL(request.url), req: { method: request.method, headers: request.headers } },
      async () => {
        const { default: server } = await import("@tanstack/react-start/server-entry");
        return server.fetch(request);
      },
    );
    const response = result as Response;
    const headers = new Headers(response.headers);
    if (noindex) headers.set("X-Robots-Tag", "noindex, nofollow");
    if (env.CF_VERSION_METADATA?.id) headers.set("X-Worker-Version", env.CF_VERSION_METADATA.id);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
