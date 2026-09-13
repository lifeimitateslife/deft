import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { placeTestWindow } from "./window-placement.mjs";
import { menuCommand } from "./menu-helpers.mjs";
await fs.mkdir(".scratch", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".scratch/windows-blur-ui-"));
const profile = path.join(root, "profile");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DEFT_EXECUTABLE;
let app;
async function launch() {
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [...(executablePath ? [] : ["."]), `--user-data-dir=${profile}`],
    env,
  });
  const page = await app.firstWindow();
  await placeTestWindow(app);
  await page.locator(".cm-content").waitFor();
  await menuCommand(app, page, "View", "Preferences…");
  await page
    .getByRole("slider", { name: "Background blur", exact: true })
    .waitFor();
  return page;
}
try {
  let page = await launch();
  let blur = page.getByRole("slider", { name: "Background blur", exact: true });
  await blur.fill("73");
  await page.waitForFunction(
    async () => (await window.deft.settings()).backgroundBlurStrength === 73,
  );
  assert.equal(
    await page.getByLabel("Background opacity", { exact: true }).inputValue(),
    "68",
  );
  await page.screenshot({ path: path.join(root, "slider.png") });
  await app.evaluate(({ app }) => app.exit(0));
  app = null;
  page = await launch();
  blur = page.getByRole("slider", { name: "Background blur", exact: true });
  assert.equal(await blur.inputValue(), "73");
  await page
    .getByRole("button", { name: "Reset background blur", exact: true })
    .click();
  assert.equal(await blur.inputValue(), "40");
  await blur.fill("0");
  await page.waitForFunction(
    async () => (await window.deft.settings()).backgroundBlur === false,
  );
  await page
    .getByRole("button", { name: "Revert appearance changes", exact: true })
    .click();
  assert.equal(await blur.inputValue(), "73");
  await page.getByLabel("Material", { exact: true }).selectOption("solid");
  assert.equal(await blur.isDisabled(), true);
  await page.getByLabel("Material", { exact: true }).selectOption("glass");
  assert.equal(await blur.inputValue(), "73");
  for (const property of [
    "shouldUseHighContrastColors",
    "prefersReducedTransparency",
  ]) {
    // Inject a read-only Electron signal in this test process. Never change the
    // owner's Windows accessibility preferences to exercise the fallback.
    await app.evaluate(({ nativeTheme }, property) => {
      Object.defineProperty(nativeTheme, property, {
        get: () => true,
        configurable: true,
      });
      nativeTheme.emit("updated");
    }, property);
    await page.waitForFunction(
      async () => !(await window.deft.material("glass")).enabled,
    );
    assert.equal(await blur.isDisabled(), true);
    assert.equal(
      (await page.evaluate(() => window.deft.settings()))
        .backgroundBlurStrength,
      73,
    );
    await app.evaluate(({ nativeTheme }, property) => {
      delete nativeTheme[property];
      nativeTheme.emit("updated");
    }, property);
    await page.waitForFunction(
      async () => (await window.deft.material("glass")).enabled,
    );
  }
  console.log(
    `PASS Windows slider persistence, reset, revert, opacity independence and injected accessibility signals: ${root}`,
  );
} finally {
  if (app) {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close();
  }
}
