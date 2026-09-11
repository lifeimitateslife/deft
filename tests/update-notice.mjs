import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { openPreferences } from "./menu-helpers.mjs";
await fs.mkdir(".scratch", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".scratch/update-notice-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DEFT_EXECUTABLE;
const currentVersion = JSON.parse(
  await fs.readFile("package.json", "utf8"),
).version;
const [major, minor, patch] = currentVersion.split(".").map(Number);
const nextVersion = `${major}.${minor}.${patch + 1}`;
const laterVersion = `${major}.${minor}.${patch + 2}`;
const releasePage = (version) =>
  `https://github.com/lifeimitateslife/deft/releases/tag/v${version}`;
const launch = () =>
  electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [...(executablePath ? [] : ["."]), `--user-data-dir=${root}`],
    env,
  });
let app = await launch();
try {
  async function prepare() {
    const page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    await page.locator(".cm-content").waitFor();
    // Finish the startup request before replacing only the transport and clock.
    // The production checker, IPC handlers, preload and UI stay in use.
    await page.evaluate(() => window.deft.updates());
    await app.evaluate(({ shell }) => {
      globalThis.updateTest = {
        clock: Date.now(),
        feed: [],
        mode: "ok",
        calls: 0,
        opened: [],
        failOpen: false,
      };
      Date.now = () => globalThis.updateTest.clock;
      globalThis.fetch = async (url) => {
        const t = globalThis.updateTest;
        if (
          url !==
          "https://api.github.com/repos/lifeimitateslife/deft/releases?per_page=100"
        )
          throw Error("Unexpected request");
        t.calls++;
        if (t.mode === "offline") throw Error("Offline test");
        return { ok: t.mode === "ok", json: async () => t.feed };
      };
      shell.openExternal = async (url) => {
        if (globalThis.updateTest.failOpen) throw Error("Browser unavailable");
        globalThis.updateTest.opened.push(url);
      };
    });
    return page;
  }
  async function check(page, version, mode = "ok") {
    await app.evaluate(
      (_, { version, mode }) => {
        const t = globalThis.updateTest;
        t.clock += 86400001;
        t.mode = mode;
        t.feed = version
          ? [
              {
                tag_name: `v${version}`,
                draft: false,
                prerelease: true,
                published_at: "2026-09-11T00:00:00Z",
                html_url: "https://malicious.invalid/ignored",
                assets: [
                  `DEFT-${version}-arm64.dmg`,
                  `DEFT-${version}-x64.dmg`,
                  `DEFT.Setup.${version}.exe`,
                ].map((name) => ({ name, size: 100, state: "uploaded" })),
              },
            ]
          : [];
      },
      { version, mode },
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const result = await page.evaluate(() => window.deft.updates());
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    return result;
  }
  assert.equal(
    await app.evaluate(({ app }) => app.getVersion()),
    currentVersion,
  );
  let page = await prepare();
  const text = "Update notices must preserve this unfinished draft.";
  await page.locator(".cm-content").fill(text);
  assert.equal(await check(page, null, "offline"), null);
  assert.equal(
    await page.getByRole("status", { name: "Update available" }).count(),
    0,
  );
  assert.equal(await check(page, null, "limited"), null);
  assert.deepEqual(await check(page, nextVersion), { version: nextVersion });
  let notice = page.getByRole("status", { name: "Update available" });
  await notice.waitFor();
  assert.equal(
    await notice.getByText(`DEFT ${nextVersion} is available.`).isVisible(),
    true,
  );
  assert.equal(await page.locator(".cm-content").textContent(), text);
  assert.equal(
    await page
      .locator(".cm-content")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  const calls = await app.evaluate(() => globalThis.updateTest.calls);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.evaluate(() => window.deft.updates());
  assert.equal(await app.evaluate(() => globalThis.updateTest.calls), calls);
  await page.screenshot({ path: path.join(root, "notice.png") });
  await notice.getByRole("button", { name: "View update" }).click();
  assert.deepEqual(await app.evaluate(() => globalThis.updateTest.opened), [
    releasePage(nextVersion),
  ]);
  await page.evaluate(() =>
    window.deft.openUpdate("https://malicious.invalid/ignored"),
  );
  assert.equal(
    await app.evaluate(() => globalThis.updateTest.opened.at(-1)),
    releasePage(nextVersion),
  );
  await openPreferences(app, page);
  assert.equal(await notice.count(), 0);
  await page.getByRole("button", { name: "Close Preferences" }).click();
  await notice.waitFor();
  await notice
    .getByRole("button", { name: "Dismiss update notification" })
    .click();
  assert.equal(await notice.count(), 0);
  await app.evaluate(({ app }) => app.exit(0));
  await app.close();
  app = await launch();
  page = await prepare();
  assert.deepEqual(await check(page, nextVersion), { version: nextVersion });
  notice = page.getByRole("status", { name: "Update available" });
  assert.equal(
    await notice.count(),
    0,
    "dismissed version stays hidden after restart",
  );
  assert.deepEqual(await check(page, laterVersion), { version: laterVersion });
  await notice.waitFor();
  await app.evaluate(() => {
    globalThis.updateTest.failOpen = true;
  });
  await notice.getByRole("button", { name: "View update" }).click();
  await notice.getByText("Couldn't open your browser. Try again.").waitFor();
  await app.evaluate(() => {
    globalThis.updateTest.failOpen = false;
  });
  await notice.getByRole("button", { name: "View update" }).click();
  await notice.getByText(`DEFT ${laterVersion} is available.`).waitFor();
  await check(page, null);
  assert.equal(
    await notice.count(),
    0,
    "withdrawn releases disappear after next check",
  );
  console.log(
    "PASS update notice: real checker/IPC/UI, offline/rate limit, daily caching, official link, no focus/draft interruption, preferences isolation, persistent dismissal, future version, browser retry and withdrawn release",
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0));
  await app.close();
}
