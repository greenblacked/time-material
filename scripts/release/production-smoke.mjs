import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
const get = (path, timeout = 10000) =>
  fetch(`https://time.szolotov.com${path}`, {
    signal: AbortSignal.timeout(timeout),
    cache: "no-store",
  });
const mode = process.argv[2];
assert.ok(["capture", "verify"].includes(mode));
let expected = process.env.VERSION_ID;
if (mode === "capture") {
  const response = await get("/");
  assert.equal(
    response.status,
    200,
    "Healthy production required before automated release; bootstrap first deployment separately",
  );
  expected = response.headers.get("x-worker-version");
}
assert.match(expected ?? "", /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
const deadline = Date.now() + 120000;
let response;
while (Date.now() < deadline) {
  try {
    response = await get("/", 3000);
    if (response.ok && response.headers.get("x-worker-version") === expected) break;
  } catch {
    /* Retry readiness or ignore an already-exited process. */
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.equal(response?.status, 200);
assert.equal(response.headers.get("x-worker-version"), expected);
const html = await response.text();
assert.match(html, /Time Material/);
const asset = html.match(/src="(\/assets\/[^"]+\.js)"/);
assert.ok(asset?.[1].startsWith("/assets/"));
assert.equal((await get(asset[1])).status, 200);
const manifest = await get("/pwa/manifest.webmanifest");
assert.equal(manifest.status, 200);
assert.equal(manifest.headers.get("x-worker-version"), expected);
assert.ok((await manifest.json()).name);
if (mode === "capture") appendFileSync(process.env.GITHUB_OUTPUT, `version_id=${expected}\n`);
console.log(`Production ${expected} verified`);
