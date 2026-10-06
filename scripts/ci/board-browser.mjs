import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const base = process.env.BROWSER_BASE_URL || "http://127.0.0.1:4173";
const artifactDir = resolve(process.env.BROWSER_ARTIFACT_DIR || "artifacts/browser");
const engineNames = (process.env.BROWSER_ENGINES || "chromium,webkit").split(",");
const browserTypes = { chromium, webkit };
for (const name of engineNames) assert.ok(browserTypes[name], `Unsupported browser: ${name}`);
const query = new URLSearchParams({
  d: "2026-10-05",
  dur: "60",
  cut: "960",
  span: "day",
  week: "1",
  p: "Europe/Kyiv,540,1020;Europe/London,540,1020;America/New_York,540,1020",
});
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("time-material:v1")));
const waitState = (page, key, value) =>
  page.waitForFunction(
    ({ key, value }) => JSON.parse(localStorage.getItem("time-material:v1") || "{}")[key] === value,
    { key, value },
  );
await mkdir(artifactDir, { recursive: true });

for (const [engine, browserType] of engineNames.map((name) => [name, browserTypes[name]])) {
  const browser = await browserType.launch({ headless: true });
  try {
    for (const [size, viewport] of Object.entries({
      desktop: { width: 1440, height: 1000 },
      mobile: { width: 390, height: 844 },
      tablet: { width: 820, height: 1180 },
      "tablet-landscape": { width: 1180, height: 820 },
    })) {
      for (const colorScheme of ["light", "dark"]) {
        const context = await browser.newContext({
          viewport,
          colorScheme,
          timezoneId: "Europe/Kyiv",
          acceptDownloads: true,
          isMobile: size !== "desktop",
          hasTouch: size !== "desktop",
          deviceScaleFactor: size === "mobile" ? 3 : 2,
        });
        try {
          const page = await context.newPage();
          const errors = [];
          page.on("pageerror", (error) => errors.push(error.message));
          await page.goto(`${base}/?${query}`, { waitUntil: "networkidle" });
          await waitState(page, "span", "day");
          assert.equal(
            await page.getByRole("heading", { name: "Cities", exact: true }).count(),
            0,
            "No duplicate Cities section",
          );
          assert.equal(
            await page.locator("input[type=time]:visible").count(),
            0,
            "Work-hours forms collapsed initially",
          );
          assert.equal(
            await page.locator(".float-bar").getByText("Add city", { exact: true }).count(),
            0,
            "No old toolbar city button",
          );
          const themeSwitch = page.getByRole("switch", { name: "Dark theme", exact: true });
          const oldTheme = await themeSwitch.getAttribute("aria-checked");
          await themeSwitch.click();
          assert.notEqual(await themeSwitch.getAttribute("aria-checked"), oldTheme);
          await themeSwitch.click();
          assert.equal(
            await page.evaluate(() =>
              getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim(),
            ),
            colorScheme === "dark" ? "#f3cb59" : "#165ec9",
            "Theme accent matches yellow dark / blue light",
          );
          const options = page.locator("summary").filter({ hasText: /^Options$/ });
          assert.equal(
            await options.locator("..").getAttribute("open"),
            null,
            "Advanced options closed initially",
          );
          await page.screenshot({
            path: join(artifactDir, `${engine}-${size}-${colorScheme}.png`),
            fullPage: true,
          });
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth + 1,
            ),
            true,
            "Page does not overflow horizontally",
          );

          const cityTrigger = page.getByLabel("Options for Kyiv", { exact: true });
          await cityTrigger.click();
          const menu = page.locator(".city-row-menu[open] > .glass-menu");
          const menuBox = await menu.boundingBox();
          assert.ok(
            menuBox.x >= 0 && menuBox.x + menuBox.width <= viewport.width,
            "City menu fits viewport",
          );
          const covered = await page.evaluate(() => {
            const menu = document.querySelector(".city-row-menu[open] > .glass-menu");
            const bounds = menu.getBoundingClientRect();
            return [...document.querySelectorAll(".city-row-menu:not([open]) > summary")].every(
              (trigger) => {
                const rect = trigger.getBoundingClientRect();
                const x = rect.x + rect.width / 2,
                  y = rect.y + rect.height / 2;
                return (
                  y < 0 ||
                  y >= window.innerHeight ||
                  x < bounds.left ||
                  x > bounds.right ||
                  y < bounds.top ||
                  y > bounds.bottom ||
                  menu.contains(document.elementFromPoint(x, y))
                );
              },
            );
          });
          assert.equal(covered, true, "City menu paints above other row triggers");
          const remove = page.getByRole("button", { name: "Remove Kyiv", exact: true });
          await remove.scrollIntoViewIfNeeded();
          assert.equal(
            await remove.evaluate((el) => {
              const r = el.getBoundingClientRect();
              return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
            }),
            true,
            "Menu bottom action stays above following panel",
          );
          await page.screenshot({
            path: join(artifactDir, `glass-menu-${engine}-${size}-${colorScheme}.png`),
            fullPage: true,
          });
          await page.keyboard.press("Escape");
          assert.equal(
            await page.locator(".city-row-menu[open]").count(),
            0,
            "Escape closes city menu",
          );

          const dateInput = page.getByLabel("Board date", { exact: true });
          const calendarTrigger = page.getByRole("button", { name: "Open calendar", exact: true });
          await dateInput.fill("2026-02-30");
          assert.equal(await dateInput.getAttribute("aria-invalid"), "true");
          assert.equal(
            (await state(page)).day,
            "2026-10-05",
            "Invalid draft does not change board date",
          );
          await dateInput.press("Tab");
          assert.equal(await dateInput.inputValue(), "2026-10-05", "Blur restores valid date");
          await page.evaluate(() => window.scrollTo(0, 300));
          const calendarScroll = await page.evaluate(() => window.scrollY);
          if (size !== "desktop") {
            assert.ok(
              await dateInput.evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 16),
              "Touch date field avoids Safari focus zoom",
            );
            await calendarTrigger.tap();
          } else {
            await calendarTrigger.click();
          }
          const calendarDialog = page.getByRole("dialog", { name: "Choose date", exact: true });
          await calendarDialog.waitFor({ state: "visible" });
          await page.waitForFunction(() =>
            document.activeElement?.matches(".board-calendar-popover .rdp-day_button"),
          );
          const calendarBounds = await calendarDialog.boundingBox();
          assert.ok(
            calendarBounds.x >= 0 &&
              calendarBounds.y >= 0 &&
              calendarBounds.x + calendarBounds.width <= viewport.width + 1 &&
              calendarBounds.y + calendarBounds.height <= viewport.height + 1,
            "Calendar fits viewport",
          );
          const calendarStyle = await calendarDialog.evaluate((el) => {
            const style = getComputedStyle(el);
            const selected = getComputedStyle(el.querySelector(".rdp-selected .rdp-day_button"));
            const probe = document.createElement("span");
            probe.style.backgroundColor = "var(--color-accent)";
            el.append(probe);
            const accent = getComputedStyle(probe).backgroundColor;
            probe.remove();
            return {
              blur: style.backdropFilter || style.webkitBackdropFilter,
              background: style.backgroundColor,
              selected: selected.backgroundColor,
              accent,
            };
          });
          assert.match(calendarStyle.blur, /blur\(/, "Calendar uses frosted glass");
          assert.notEqual(
            calendarStyle.background,
            "rgba(0, 0, 0, 0)",
            "Calendar has readable surface",
          );
          assert.equal(
            calendarStyle.selected,
            calendarStyle.accent,
            "Selected date follows theme accent",
          );
          assert.equal(
            await page.evaluate(() => window.scrollY),
            calendarScroll,
            "Opening calendar keeps scroll position",
          );
          await page.screenshot({
            path: join(artifactDir, `calendar-${engine}-${size}-${colorScheme}.png`),
            fullPage: true,
          });
          await page.keyboard.press("Escape");
          await calendarDialog.waitFor({ state: "hidden" });
          await page.waitForFunction(() =>
            document.activeElement?.matches('button[aria-label="Open calendar"]'),
          );
          assert.equal(
            await calendarTrigger.evaluate((el) => document.activeElement === el),
            true,
            "Escape returns focus to calendar trigger",
          );
          assert.ok(
            Math.abs((await page.evaluate(() => window.scrollY)) - calendarScroll) <= 2,
            "Closing calendar keeps scroll position within pixel rounding",
          );
          await calendarTrigger.press("Enter");
          await calendarDialog.waitFor({ state: "visible" });
          await page.waitForFunction(() =>
            document.activeElement?.matches(".board-calendar-popover .rdp-day_button"),
          );
          await page.keyboard.press("ArrowRight");
          await page.keyboard.press("Enter");
          await waitState(page, "day", "2026-10-06");
          await calendarDialog.waitFor({ state: "hidden" });
          assert.ok(
            Math.abs((await page.evaluate(() => window.scrollY)) - calendarScroll) <= 2,
            "Selecting date keeps scroll position within pixel rounding",
          );
          await page.getByLabel("Board date").fill("2026-10-05");
          await waitState(page, "day", "2026-10-05");
          await page.evaluate(() => window.scrollTo(0, 0));
          await options.click();
          await page.getByLabel("Time format", { exact: true }).selectOption("12h");
          await waitState(page, "clockFormat", "12h");
          assert.match(
            await page
              .getByRole("slider", { name: "Meeting start", exact: true })
              .getAttribute("aria-valuetext"),
            /PM/,
          );
          await page.getByLabel("Show timezones", { exact: true }).uncheck();
          await waitState(page, "showTimezone", false);
          await page.getByLabel("Mark weekends", { exact: true }).uncheck();
          await waitState(page, "markWeekends", false);
          await options.click();

          await page.getByLabel("Options for London", { exact: true }).click();
          await page
            .getByRole("button", { name: "Use London as reference city", exact: true })
            .click();
          await page.waitForFunction(
            () =>
              JSON.parse(localStorage.getItem("time-material:v1")).places[0].zone ===
              "Europe/London",
          );
          assert.equal(
            (await state(page)).cutMinutes,
            840,
            "Reference city change preserves 13:00 UTC",
          );
          const slider = page.getByRole("slider", { name: "Meeting start", exact: true });
          await slider.focus();
          await page.keyboard.press("ArrowRight");
          await waitState(page, "cutMinutes", 855);
          await page.keyboard.press("Shift+ArrowRight");
          await waitState(page, "cutMinutes", 860);
          await page.getByRole("button", { name: "Resize meeting end", exact: true }).focus();
          await page.keyboard.press("Shift+ArrowRight");
          await waitState(page, "durationMin", 65);

          const track = page.getByTestId("time-track");
          // Keyboard focus can scroll the track underneath the sticky toolbar.
          await page.evaluate(() => window.scrollTo(0, 0));
          await track.evaluate((el) => {
            el.parentElement.scrollLeft = Math.max(0, (el.scrollWidth * 540) / 1440 - 40);
          });
          const bounds = await track.boundingBox();
          const x = (minute) => bounds.x + (minute / 1440) * bounds.width;
          await page.mouse.move(x(540), bounds.y + 8);
          await page.mouse.down();
          await page.mouse.move(x(660), bounds.y + 8, { steps: 10 });
          await page.mouse.up();
          await waitState(page, "cutMinutes", 540);
          await waitState(page, "durationMin", 120);
          const endHandle = page.getByRole("button", { name: "Resize meeting end", exact: true });
          const edge = await endHandle.boundingBox();
          await page.mouse.move(edge.x + edge.width / 2, edge.y + 12);
          await page.mouse.down();
          await page.mouse.move(edge.x + edge.width / 2 + (bounds.width / 1440) * 30, edge.y + 12, {
            steps: 5,
          });
          await page.mouse.up();
          await waitState(page, "cutMinutes", 540);
          await waitState(page, "durationMin", 150);

          await page
            .locator("summary")
            .filter({ hasText: /^Add city or timezone$/ })
            .click();
          await page.getByLabel("Search cities or timezones", { exact: true }).fill("UTC");
          await page.getByRole("button", { name: /^UTC\s+UTC$/ }).click();
          await page.waitForFunction(() =>
            JSON.parse(localStorage.getItem("time-material:v1")).places.some(
              (place) => place.zone === "UTC",
            ),
          );
          const calendarLink = page.getByRole("link", { name: /Google Calendar/ });
          const exportUrl = new URL(await calendarLink.getAttribute("href"));
          assert.equal(exportUrl.origin, "https://calendar.google.com");
          assert.equal(exportUrl.searchParams.get("action"), "TEMPLATE");
          assert.match(exportUrl.searchParams.get("dates"), /^20261005T080000Z\/20261005T103000Z$/);
          const before = await state(page);
          await page.reload({ waitUntil: "networkidle" });
          await waitState(page, "cutMinutes", 540);
          assert.deepEqual(
            await state(page),
            before,
            "Reload preserves shared selection/preferences",
          );
          assert.deepEqual(errors, [], `${engine} ${size} ${colorScheme} has no page errors`);
          console.log(
            `PASS ${engine} ${size} ${colorScheme}: initial simplicity, date, formats, preferences, reference city, keyboard range, UTC search, calendar export, reload`,
          );
        } catch (error) {
          const failedPage = context.pages()[0];
          if (failedPage) {
            await failedPage
              .screenshot({
                path: join(artifactDir, `failure-${engine}-${size}-${colorScheme}.png`),
                fullPage: true,
              })
              .catch(() => {});
          }
          throw error;
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}
