import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderInstallPage, timePwaPlugin } from "./time-pwa-plugin.mjs";
import {
  acceptsHtml,
  appNameFromHost,
  createHeadInjector,
  injectTimePwaHead,
  isDocumentPath,
  isInstallQuery,
  publicAppHost,
  renderWebManifest,
  snapshotOgIdentity,
  stripInstallParams,
} from "./time-pwa-shared.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const empty = mkdtempSync(join(tmpdir(), "time-pwa-"));
const inject = (html, context = {}) => injectTimePwaHead(html, { cwd: empty, ...context });

test("head injection adds local PWA resources and preserves document identity", () => {
  const result = inject(
    "<html><head><title>Cats &amp; Dogs</title></head><body>Hello</body></html>",
  );
  assert.match(result, /href="\/pwa\/manifest.webmanifest"/);
  assert.match(result, /href="\/pwa\/icon-180.png"/);
  assert.match(result, /property="og:title" content="Cats &amp; Dogs"/);
  assert.match(result, /<body>Hello<\/body>/);
  assert.doesNotMatch(result, /<script|property="og:image"/);
  assert.equal(inject(result), result);
});

test("local card snapshot persists in bundled metadata", () => {
  const workspace = mkdtempSync(join(tmpdir(), "time-card-"));
  mkdirSync(join(workspace, "public"));
  writeFileSync(join(workspace, "public/og.png"), "card");
  const identity = snapshotOgIdentity(workspace);
  assert.equal(identity.site.image, "/og.png");
  const result = inject("<head></head>", { host: "time.example", site: identity.site });
  assert.match(result, /property="og:image" content="https:\/\/time.example\/og.png"/);
});

test("missing card removes stale share images without an external fallback", () => {
  const result = inject(
    '<head><meta property="og:image" content="https://old.example/card.png"></head>',
    { host: "time.example" },
  );
  assert.doesNotMatch(result, /property="og:image"|old.example/);
});

test("site metadata overrides title and escapes HTML", () => {
  const result = inject("<head><title>Old</title></head>", {
    site: { title: 'Time "Together"', description: "A & B" },
  });
  assert.match(result, /content="Time &quot;Together&quot;"/);
  assert.match(result, /content="A &amp; B"/);
});

test("configured public hostname determines local card origin", () => {
  const previous = process.env.VITE_PUBLIC_HOSTNAME;
  process.env.VITE_PUBLIC_HOSTNAME = "time.example";
  try {
    assert.match(
      inject("<head></head>", { host: "preview.example", site: { image: "/og.jpg" } }),
      /https:\/\/time.example\/og.jpg/,
    );
  } finally {
    if (previous === undefined) delete process.env.VITE_PUBLIC_HOSTNAME;
    else process.env.VITE_PUBLIC_HOSTNAME = previous;
  }
});

test("hostname validation rejects local, malformed and internal hosts", () => {
  assert.equal(publicAppHost("localhost:8080"), "");
  assert.equal(publicAppHost("127.0.0.1"), "");
  assert.equal(publicAppHost("deploy.vercel.app"), "");
  assert.equal(publicAppHost("<script>.example"), "");
  assert.equal(publicAppHost("time.example:443"), "time.example");
  assert.equal(appNameFromHost("preview.example"), "Time");
});

test("streaming injector handles split closing tags and UTF-8", () => {
  const injector = createHeadInjector({ cwd: empty });
  const source = Buffer.from("<html><head><title>Київ</title></head><body>Done</body></html>");
  const parts = [];
  for (const byte of source) parts.push(...injector.push(Buffer.from([byte])));
  parts.push(...injector.flush());
  assert.equal(Buffer.concat(parts).toString(), inject(source.toString()));
});

test("streaming fallback inserts head when none is present", () => {
  const injector = createHeadInjector({ cwd: empty });
  assert.deepEqual(injector.push("<html><body>Done</body></html>"), []);
  assert.match(Buffer.concat(injector.flush()).toString(), /<head>.*manifest/);
  assert.deepEqual(injector.flush(), []);
});

test("install detection requires iOS and a true install value", () => {
  assert.equal(isInstallQuery("/?install=1&platform=ios"), true);
  assert.equal(isInstallQuery("/?install=true&platform=IOS"), true);
  assert.equal(isInstallQuery("/?install=1"), false);
  assert.equal(isInstallQuery("/?install=0&platform=ios"), false);
  assert.equal(isDocumentPath("/pwa/install/styles.css"), false);
  assert.equal(isDocumentPath("/api/test"), false);
  assert.equal(isDocumentPath("/planner"), true);
  assert.equal(acceptsHtml("text/html"), true);
  assert.equal(acceptsHtml("application/json"), false);
});

test("install destination retains app parameters while preventing off-site navigation", () => {
  assert.equal(
    stripInstallParams("/planner?install=1&platform=ios&city=Kyiv#now"),
    "/planner?city=Kyiv#now",
  );
  for (const destination of [
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "/\nexample",
  ]) {
    assert.throws(() => stripInstallParams(destination), TypeError);
  }
});

test("install page uses application branding and existing local assets", () => {
  const html = renderInstallPage("time.example", "/?install=1&platform=ios");
  assert.match(html, /Time/);
  assert.match(html, /\/pwa\/install\/styles.css/);
  assert.doesNotMatch(html, /Powered by|powered-brand/);
  for (const match of html.matchAll(/(?:src|href)="(\/pwa\/[^"?]+)"/g)) {
    if (!match[1].includes("manifest")) readFileSync(join(root, "public", match[1]));
  }
});

test("manifest uses consistent application identity and local icon", () => {
  const manifest = JSON.parse(renderWebManifest("time.example"));
  assert.equal(manifest.name, "Time");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.icons[0].src, "/pwa/icon-180.png");
});

test("development middleware serves the local manifest", () => {
  const middleware = [];
  timePwaPlugin().configureServer({ middlewares: { use: (handler) => middleware.push(handler) } });
  const headers = {};
  let body;
  const response = {
    setHeader: (name, value) => {
      headers[name] = value;
    },
    end: (value) => {
      body = value;
    },
  };
  middleware[0](
    { method: "GET", url: "/pwa/manifest.webmanifest", headers: { host: "time.example" } },
    response,
    () => assert.fail("unexpected fallthrough"),
  );
  assert.equal(response.statusCode, 200);
  assert.match(headers["content-type"], /application\/manifest\+json/);
  assert.equal(JSON.parse(body).name, "Time");
});
