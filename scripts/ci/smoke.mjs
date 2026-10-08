import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = process.env.SMOKE_PORT || "4175";
const base = `http://127.0.0.1:${port}`;
const child = spawn(
  "npm",
  ["run", "preview", "--", "--host", "127.0.0.1", "--port", port, "--strictPort"],
  {
    detached: true,
    stdio: "inherit",
  },
);
let spawnError;
child.on("error", (error) => {
  spawnError = error;
});
const exited = new Promise((resolve) => child.once("exit", resolve));
try {
  let response;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnError) throw spawnError;
    assert.equal(child.exitCode, null, "Preview exited before becoming ready");
    try {
      response = await fetch(base, { signal: AbortSignal.timeout(2000) });
      if (response.ok) break;
    } catch {
      /* The server may still be starting. */
    }
    await delay(1000);
  }
  assert.ok(response?.ok, "Built preview did not respond successfully");
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  const html = await response.text();
  assert.match(html, /Time Material/, "SSR returns the application title");
  assert.match(html, /Add city or timezone/, "SSR renders the board controls");
  console.log("PASS built preview serves the server-rendered board");
} finally {
  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* Already stopped. */
    }
    await Promise.race([exited, delay(5000)]);
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      /* Already stopped. */
    }
  }
}
