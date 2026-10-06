import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const base = process.env.BROWSER_BASE_URL || "http://127.0.0.1:8080";
const artifacts = resolve(process.env.BROWSER_ARTIFACT_DIR || "artifacts/world-cities");
const engines = (process.env.BROWSER_ENGINES || "chromium,webkit").split(",");
const browserTypes = { chromium, webkit };
const query = new URLSearchParams({ d: "2026-10-05", cut: "960", dur: "60", span: "day", p: "Europe/Kyiv,540,1020;Europe/London,540,1020" });
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("time-material:v1")));
const pause = (page) => page.waitForTimeout(600);
await mkdir(artifacts, { recursive: true });

async function touchGesture(session, page, from, to) {
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...from, id: 1 }] });
  for (let i = 1; i <= 12; i++) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + (to.x - from.x) * i / 12, y: from.y + (to.y - from.y) * i / 12, id: 1 }] });
    await page.waitForTimeout(25);
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await pause(page);
}

async function mobileTimeline(page, context, engine) {
  const track = page.getByTestId("time-track");
  await track.evaluate((el) => {
    const toolbar = document.querySelector(".float-bar");
    const targetTop = (toolbar?.getBoundingClientRect().bottom ?? 0) + 32;
    window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - targetTop);
    el.parentElement.scrollLeft = 0;
  });
  const before = await state(page);
  const action = await track.evaluate((el) => getComputedStyle(el).touchAction);
  assert.ok(action === "manipulation" || (action.includes("pan-x") && action.includes("pan-y")), "Timeline permits both native pan axes");
  await track.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const init = { bubbles: true, pointerType: "touch", pointerId: 91, isPrimary: true, button: 0, clientX: rect.left + 20, clientY: rect.top + 10 };
    el.dispatchEvent(new PointerEvent("pointerdown", init));
    el.dispatchEvent(new PointerEvent("pointercancel", init));
    el.dispatchEvent(new PointerEvent("pointerup", init));
  });
  await pause(page);
  assert.equal((await state(page)).cutMinutes, before.cutMinutes, "Cancelled touch does not select");
  if (engine !== "chromium") {
    console.log("WebKit: pointer cancellation and pan CSS verified; physical native swipe is not simulated");
    return;
  }
  const session = await context.newCDPSession(page);
  try {
    const box = await track.locator("..").boundingBox();
    const left = box.x + 25, right = box.x + box.width - 25, y = box.y + 12;
    assert.ok(await track.evaluate((el, { left, right, y }) => [left, right].every((x) => {
      const target = document.elementFromPoint(x, y);
      return target && el.contains(target) && !target.closest("[data-cut]");
    }), { left, right, y }), "Native swipe begins on uncovered blank timeline cells");
    const scroll = () => track.evaluate((el) => el.parentElement.scrollLeft);
    const start = await scroll();
    await touchGesture(session, page, { x: right, y }, { x: left, y });
    assert.ok(await scroll() > start + 30, "Native left swipe scrolls timeline right");
    assert.equal((await state(page)).cutMinutes, before.cutMinutes, "Swipe does not change meeting start");
    assert.equal((await state(page)).durationMin, before.durationMin, "Swipe does not change meeting duration");
    const afterLeft = await scroll();
    await touchGesture(session, page, { x: left, y }, { x: right, y });
    assert.ok(await scroll() < afterLeft - 30, "Native right swipe scrolls timeline left");
    const beforeTapScroll = await scroll();
    await page.touchscreen.tap(left + 20, y);
    await page.waitForFunction((cut) => JSON.parse(localStorage.getItem("time-material:v1")).cutMinutes !== cut, before.cutMinutes);
    assert.ok(Math.abs(await scroll() - beforeTapScroll) <= 1, "Touch tap keeps timeline viewport");
    const pageScroll = await page.evaluate(() => window.scrollY);
    await touchGesture(session, page, { x: right, y: y + 8 }, { x: right, y: Math.max(20, y - 120) });
    assert.ok(await page.evaluate(() => window.scrollY) > pageScroll + 20, "Vertical swipe over timeline scrolls page");
  } finally { await session.detach(); }
}

for (const engine of engines) {
  assert.ok(browserTypes[engine], `Unsupported browser ${engine}`);
  const browser = await browserTypes[engine].launch({ headless: true });
  try {
    for (const [size, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
      for (const colorScheme of ["light", "dark"]) {
        const context = await browser.newContext({ viewport, colorScheme, timezoneId: "Europe/Kyiv", isMobile: size === "mobile", hasTouch: size === "mobile" });
        const page = await context.newPage();
        const errors = [], cityRequests = [];
        page.on("pageerror", (error) => errors.push(error.message));
        context.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/data/cities/")) cityRequests.push(request.url()); });
        const shot = (name) => page.screenshot({ path: join(artifacts, `${engine}-${size}-${colorScheme}-${name}.png`), fullPage: true });
        try {
          await page.goto(`${base}/?${query}`, { waitUntil: "networkidle" });
          await page.waitForFunction(() => JSON.parse(localStorage.getItem("time-material:v1") || "{}").span === "day");
          await pause(page);
          assert.equal(cityRequests.length, 0, "Closed picker makes no world catalog requests, including worker requests");
          await shot("closed");
          const trigger = page.getByRole("button", { name: "Add city or timezone", exact: true });
          assert.ok((await trigger.boundingBox()).height >= 44, "Picker trigger has 44px touch target");
          await trigger.click();
          const search = page.getByLabel("Search cities or timezones", { exact: true });
          const picker = search.locator("xpath=../..");
          const results = picker.locator("ul > li > button");
          const searchFor = async (value) => {
            await search.fill(value);
            // Let the search debounce begin before waiting for its completion.
            await page.waitForTimeout(200);
            await picker.getByText(/Searching…/).waitFor({ state: "hidden" });
          };
          await searchFor("Manchester");
          const manchester = results.filter({ hasText: /United Kingdom.*Europe\/London/ }).first();
          await manchester.waitFor();
          assert.equal(await manchester.locator("span").first().innerText(), "Manchester");
          const bounds = await picker.boundingBox();
          assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1, "Picker fits viewport");
          assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 2, "Picker fits vertical viewport");
          assert.ok((await search.boundingBox()).height >= 44);
          assert.ok((await manchester.boundingBox()).height >= 44);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No horizontal page overflow");
          await shot("picker");
          await manchester.click();
          await page.waitForFunction(() => JSON.parse(localStorage.getItem("time-material:v1")).places.some((p) => p.label === "Manchester"));
          const added = (await state(page)).places.find((p) => p.label === "Manchester");
          assert.equal(added.zone, "Europe/London");
          assert.ok(added.cityId && added.region.includes("United Kingdom"));
          assert.equal((await state(page)).places.filter((p) => p.zone === "Europe/London").length, 2, "Manchester and London coexist");
          const saved = await state(page);
          // Remove shared query parameters so this verifies persisted city metadata rather than re-importing the URL.
          await page.evaluate(() => history.replaceState(null, "", location.pathname));
          await page.reload({ waitUntil: "networkidle" });
          assert.deepEqual((await state(page)).places, saved.places, "City metadata survives reload");
          await page.getByLabel("Options for Manchester", { exact: true }).click();
          await page.getByLabel("Rename Manchester", { exact: true }).fill("Manchester edited");
          await page.getByLabel("Rename Manchester edited", { exact: true }).press("Escape");
          assert.equal((await state(page)).places.find((p) => p.label === "London").label, "London", "Editing same-zone city preserves London");
          await page.getByLabel("Options for Manchester edited", { exact: true }).click();
          await page.getByRole("button", { name: "Remove Manchester edited", exact: true }).click();
          await page.waitForFunction(() => JSON.parse(localStorage.getItem("time-material:v1")).places.filter((p) => p.zone === "Europe/London").length === 1);
          assert.equal((await state(page)).places.find((p) => p.zone === "Europe/London").label, "London");
          await trigger.click();
          await searchFor("Sao Paulo");
          const sao = results.filter({ hasText: "São Paulo" }).filter({ hasText: "America/Sao_Paulo" }).first();
          await sao.waitFor();
          const asciiResult = await sao.innerText();
          await searchFor("São Paulo");
          await sao.waitFor();
          assert.equal(await sao.innerText(), asciiResult, "ASCII and native accented search resolve same city");
          await searchFor("Abel Paez");
          const village = results.filter({ hasText: "No timezone recorded" }).first();
          await village.waitFor();
          assert.equal(await village.isDisabled(), true, "Small settlement without recorded timezone is visible and disabled");
          await searchFor("ma");
          const more = picker.getByRole("button", { name: /^Load more/ });
          await more.waitFor();
          await page.waitForFunction(() => document.querySelector('[aria-label="Search cities or timezones"]')?.parentElement.parentElement.querySelector("ul")?.children.length >= 40);
          assert.ok(await results.count() <= 41, "World result DOM is bounded to one page");
          const firstPage = await results.allTextContents();
          const firstText = await results.first().textContent();
          await more.click();
          await picker.getByRole("button", { name: "Previous results", exact: true }).waitFor();
          await page.waitForFunction((first) => {
            const item = document.querySelector('[aria-label="Search cities or timezones"]')?.parentElement.parentElement.querySelector("ul > li");
            return item && item.textContent !== first;
          }, firstText);
          assert.notDeepEqual(await results.allTextContents(), firstPage, "Load more advances result page");
          assert.ok(await results.count() <= 41, "Pagination keeps bounded DOM");
          await trigger.click();
          if (size === "mobile") await mobileTimeline(page, context, engine);
          assert.deepEqual(errors, [], "No browser errors");
          console.log(`PASS ${engine} ${size} ${colorScheme}: lazy catalog, world search, pagination, city identity, metadata persistence, responsive picker${size === "mobile" ? ", touch timeline" : ""}`);
        } catch (error) { await shot("failure").catch(() => {}); throw error; }
        finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
}
