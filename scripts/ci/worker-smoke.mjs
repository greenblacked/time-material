import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const base = "http://127.0.0.1:8081";
const get = (path, timeout = 10000, options = {}) =>
  fetch(base + path, { ...options, signal: AbortSignal.timeout(timeout) });
for (const mode of ["index", "noindex"]) {
  const logfile = join(process.env.RUNNER_TEMP || tmpdir(), `worker-${mode}.log`);
  const log = createWriteStream(logfile);
  const worker = spawn(
    "./node_modules/.bin/wrangler",
    [
      "dev",
      "--config",
      "dist/server/wrangler.json",
      "--local",
      "--port",
      "8081",
      "--var",
      `ROBOTS:${mode}`,
    ],
    {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  worker.stdout.pipe(log);
  worker.stderr.pipe(log);
  let spawnError;
  worker.on("error", (error) => {
    spawnError = error;
  });
  const exited = new Promise((resolve) => worker.once("close", resolve));
  try {
    const deadline = Date.now() + 60000;
    let response;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (worker.exitCode !== null) throw Error(`Worker exited: ${worker.exitCode}`);
      try {
        response = await get("/", 3000);
        if (response.ok) break;
      } catch {
        /* Retry readiness or ignore an already-exited process. */
      }
      await delay(500);
    }
    assert.ok(response?.ok, "Worker SSR must respond");
    assert.ok(
      response.headers.get("x-worker-version"),
      "Worker version metadata must reach responses",
    );
    const noindex = mode === "noindex";
    assert.equal(response.headers.get("x-robots-tag"), noindex ? "noindex, nofollow" : null);
    const html = await response.text();
    assert.match(html, /Time Material/);
    assert.match(html, /rel="manifest"/);
    const asset = html.match(/src="(\/assets\/[^"]+\.js)"/);
    assert.ok(asset?.[1].startsWith("/assets/"), "SSR must reference a client bundle");
    assert.equal((await get(asset[1])).status, 200);
    const manifest = await get("/__Time/manifest.webmanifest");
    assert.equal(manifest.status, 200);
    assert.match(manifest.headers.get("content-type"), /manifest\+json/);
    assert.ok((await manifest.json()).name);
    assert.equal(
      (await get("/?install=1&platform=ios", 10000, { headers: { accept: "text/html" } })).status,
      200,
    );
    assert.equal((await get("/fonts/inter-400.woff2")).status, 200);
    const robots = await get("/robots.txt");
    assert.equal(robots.status, 200);
    assert.ok((await robots.text()).includes(noindex ? "Disallow: /" : "Allow: /"));
    console.log(`Worker ${mode} smoke passed`);
  } catch (error) {
    console.error(readFileSync(logfile, "utf8"));
    throw error;
  } finally {
    if (worker.pid) {
      try {
        process.kill(-worker.pid, "SIGTERM");
      } catch {
        /* Retry readiness or ignore an already-exited process. */
      }
      await Promise.race([exited, delay(5000)]);
      if (worker.exitCode === null && worker.signalCode === null) {
        try {
          process.kill(-worker.pid, "SIGKILL");
        } catch {
          /* Retry readiness or ignore an already-exited process. */
        }
        await exited;
      }
    }
    log.end();
  }
}
