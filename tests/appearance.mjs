import { placeTestWindow } from "./window-placement.mjs";
import { menuCommand, openFormat } from "./menu-helpers.mjs";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = await fs.mkdtemp(path.resolve(".scratch/appearance-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DEFT_EXECUTABLE;
const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [...(executablePath ? [] : ["."]), `--user-data-dir=${root}`],
  env,
});
const mod = process.platform === "darwin" ? "Meta" : "Control";
try {
  const page = await app.firstWindow();
  await placeTestWindow(app);
  page.setDefaultTimeout(10000);
  console.log("Appearance window ready");
  await page.locator(".cm-content").waitFor();
  await page.locator(".cm-content").fill("Unfinished typography test 雪");
  const before = await page.locator(".cm-content").textContent();
  await menuCommand(app, page, "View", "Preferences…");
  await page.getByRole("button", { name: "Browse installed fonts" }).click();
  await page.waitForFunction(() =>
    /\d+ installed families/.test(
      document.querySelector(".font-picker [role=status]").textContent,
    ),
  );
  const fonts = await page
    .getByRole("dialog", { name: "Installed fonts" })
    .getByRole("option")
    .allTextContents();
  assert.ok(fonts.length > 2);
  await page
    .getByRole("dialog", { name: "Installed fonts" })
    .getByRole("option")
    .nth(1)
    .click();
  await page.getByLabel("Search font families").waitFor({ state: "hidden" });
  await page
    .getByRole("combobox", { name: "Appearance", exact: true })
    .selectOption("custom");
  await page
    .getByRole("textbox", { name: "Window hex", exact: true })
    .fill("#181818");
  await page
    .getByRole("textbox", { name: "Document hex", exact: true })
    .fill("#121212");
  await page
    .getByRole("textbox", { name: "Text hex", exact: true })
    .fill("#eeeeee");
  await page
    .getByRole("textbox", { name: "Accent hex", exact: true })
    .fill("#aabbff");
  assert.equal(await page.locator(".cm-content").textContent(), before);
  assert.equal(await page.locator(".tab.active .dirty").count(), 1);
  await page
    .getByRole("button", { name: "Close Preferences", exact: true })
    .click();
  await page.locator(".cm-content").click();
  await page.keyboard.press(`${mod}+z`);
  assert.equal(await page.locator(".cm-content").textContent(), "");
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+z" : "Control+y",
  );
  assert.equal(await page.locator(".cm-content").textContent(), before);
  await menuCommand(app, page, "View", "Preferences…");
  for (const appearance of ["light", "dark"])
    for (const material of ["glass", "solid"]) {
      await page
        .getByRole("combobox", { name: "Appearance", exact: true })
        .selectOption(appearance);
      await page
        .getByRole("combobox", { name: "Material", exact: true })
        .selectOption(material);
      await page
        .getByRole("button", { name: "Close Preferences", exact: true })
        .click();
      await page.waitForTimeout(180);
      await page.screenshot({
        path: `test-results/current-${appearance}-${material}.png`,
      });
      await menuCommand(app, page, "View", "Preferences…");
    }
  await page
    .getByRole("button", { name: "Reset Appearance to Defaults", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("combobox", { name: "Appearance", exact: true })
      .inputValue(),
    "system",
  );
  assert.equal(await page.locator(".cm-content").textContent(), before);
  await page.keyboard.press("Escape");
  await menuCommand(app, page, "File", "New Markdown");
  await page
    .locator(".tab.active")
    .filter({ hasText: "Untitled.md" })
    .waitFor();
  await page.locator(".cm-content").fill("format me");
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press(`${mod}+b`);
  assert.match(await page.locator(".cm-content").textContent(), /format me/);
  await menuCommand(app, page, "View", "Source");
  assert.equal(
    await page.locator(".cm-content").textContent(),
    "**format me**",
  );
  await page.keyboard.press(`${mod}+k`);
  await page
    .getByRole("textbox", { name: "Link address" })
    .fill("https://example.com");
  await page.getByRole("button", { name: "Apply link" }).click();
  assert.equal(
    await page.locator(".cm-content").textContent(),
    "**[format me](https://example.com)**",
  );
  for (let i = 0; i < 4; i++) {
    await openFormat(app, page);
    await page.keyboard.press("Escape");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFormat(app, page);
  assert.equal(
    await page
      .getByRole("menu", { name: "Format", exact: true })
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page.keyboard.press("Escape");
  console.log(
    `PASS Custom colors/fonts preserve text and undo; reset isolates appearance; four views; CtrlB/K exact; menus/reduced motion.`,
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0));
  await app.close();
}
