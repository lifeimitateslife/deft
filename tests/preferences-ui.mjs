import { openPreferences } from "./menu-helpers.mjs";
import { placeTestWindow } from "./window-placement.mjs";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = await fs.mkdtemp(path.resolve(".scratch/preferences-polish-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DEFT_EXECUTABLE;
const launch = () =>
  electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [...(executablePath ? [] : ["."]), `--user-data-dir=${root}`],
    env,
  });
let app = await launch();
try {
  let page = await app.firstWindow();
  await placeTestWindow(app);
  page.setDefaultTimeout(10000);
  await page.locator(".cm-content").waitFor();
  await page.locator(".cm-content").fill("Keep this unfinished draft 雪");
  const text = await page.locator(".cm-content").textContent();
  const opener = page.locator(".cm-content");
  await page.locator(".cm-content").focus();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+ArrowLeft" : "Home",
  );
  await page.keyboard.press("Shift+ArrowRight");
  const selection = await page.evaluate(() => window.getSelection().toString());
  const scroll = await page
    .locator(".cm-scroller")
    .evaluate((el) => el.scrollTop);
  await openPreferences(app, page);
  await page.getByRole("button", { name: "Close Preferences" }).click();
  await page.locator(".cm-content").focus();
  assert.equal(
    await page.evaluate(() => window.getSelection().toString()),
    selection,
  );
  assert.equal(
    await page.locator(".cm-scroller").evaluate((el) => el.scrollTop),
    scroll,
  );
  await openPreferences(app, page);
  const preferences = page.getByRole("region", {
    name: "Preferences",
    exact: true,
  });
  const blur = page.getByLabel("Background blur", { exact: true });
  if (process.platform !== "darwin") {
    await page
      .getByRole("button", { name: "Application menu", exact: true })
      .click();
    await page.keyboard.press("Escape");
    assert.equal(
      await preferences.isVisible(),
      true,
      "Escape closes the application menu before Preferences",
    );
    assert.equal(
      await preferences.evaluate((element) =>
        element.contains(document.activeElement),
      ),
      true,
    );
  }
  assert.equal(await blur.isChecked(), true);
  if (process.platform === "win32") {
    await blur.uncheck();
    await page.evaluate(() => window.deft.settings({}));
    assert.equal(
      await page.getByLabel("Background opacity", { exact: true }).inputValue(),
      "68",
    );
    assert.equal(
      (await page.evaluate(() => window.deft.settings())).backgroundBlur,
      false,
    );
    await page.getByLabel("Material", { exact: true }).selectOption("solid");
    assert.equal(await blur.isDisabled(), true);
    await page.getByLabel("Material", { exact: true }).selectOption("glass");
    assert.equal(await blur.isChecked(), false);
  } else {
    assert.equal(await blur.isDisabled(), true);
  }
  await page
    .getByRole("button", { name: "Browse installed fonts", exact: true })
    .click();
  const picker = page.getByRole("dialog", { name: "Installed fonts" });
  await page.waitForFunction(() =>
    /\d+ installed families/.test(
      document.querySelector(".font-picker [role=status]").textContent,
    ),
  );
  await page.screenshot({ path: "test-results/preferences-picker-0.2.1.png" });
  const options = picker.getByRole("option");
  assert.ok((await options.count()) > 2);
  const font = (await options.nth(1).textContent()).trim();
  await options.nth(1).click();
  await picker.waitFor({ state: "hidden" });
  assert.equal(await preferences.isVisible(), true);
  assert.equal(
    await page.locator('button[aria-label="Body font"]').textContent(),
    font,
  );
  for (let i = 0; i < 3; i++) {
    await page.locator('button[aria-label="Body font"]').click();
    assert.equal(
      await picker.getByRole("option", { selected: true }).textContent(),
      font + " ✓",
    );
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await page.locator('button[aria-label="Body font"]').textContent(),
      font,
    );
    await page.keyboard.press("Escape");
    await picker.waitFor({ state: "hidden" });
    assert.equal(await preferences.isVisible(), true);
    assert.equal(
      await page
        .locator('button[aria-label="Body font"]')
        .evaluate((e) => e === document.activeElement),
      true,
    );
  }
  await page
    .getByRole("button", { name: "Source and code font", exact: true })
    .click();
  await page.getByLabel("Search font families").fill(font);
  await page.keyboard.press("Enter");
  await picker.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: "Source and code font", exact: true })
      .textContent(),
    font,
  );
  await page.locator('button[aria-label="Body font"]').click();
  await page.mouse.click(100, 150);
  await picker.waitFor({ state: "hidden" });
  assert.equal(await preferences.isVisible(), true);
  await page.getByRole("button", { name: "Close Preferences" }).click();
  for (let i = 0; i < 3; i++) {
    await openPreferences(app, page);
    await page.locator('button[aria-label="Body font"]').click();
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+," : "Control+,",
    );
    await picker.waitFor({ state: "hidden" });
    await preferences.waitFor({ state: "hidden" });
    assert.equal(
      await opener.evaluate((e) => e === document.activeElement),
      true,
    );
  }
  await openPreferences(app, page);
  await page.getByLabel("Reduce motion", { exact: true }).check();
  await page.getByLabel("Appearance", { exact: true }).selectOption("custom");
  await page.getByLabel("Accent hex", { exact: true }).fill("#ad3456");
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await page.getByLabel("Appearance", { exact: true }).selectOption("custom");
  assert.equal(
    await page.getByLabel("Accent hex", { exact: true }).inputValue(),
    "#ad3456",
  );
  await page
    .getByRole("button", { name: "Reset custom colors", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('input[aria-label="Accent hex"]').value ===
      "#3268a8",
  );
  assert.equal(
    await page.getByLabel("Accent hex", { exact: true }).inputValue(),
    "#3268a8",
  );
  await page.getByLabel("Text size", { exact: true }).fill("24");
  await page.getByRole("button", { name: "Reset fonts", exact: true }).click();
  assert.equal(
    await page.getByLabel("Text size", { exact: true }).inputValue(),
    "16",
  );
  assert.equal(
    await page.locator('button[aria-label="Body font"]').textContent(),
    "System default",
  );
  const opacity = page.getByLabel("Background opacity", { exact: true });
  if (await opacity.isEnabled()) {
    await opacity.fill("23");
    await page
      .getByRole("button", { name: "Reset background opacity" })
      .click();
    assert.equal(await opacity.inputValue(), "68");
  }
  await page.getByLabel("Material", { exact: true }).selectOption("solid");
  await page
    .getByRole("button", { name: "Reset Appearance to Defaults", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Appearance", { exact: true }).inputValue(),
    "system",
  );
  assert.equal(
    await page.getByLabel("Material", { exact: true }).inputValue(),
    "glass",
  );
  assert.equal(
    await page.getByLabel("Reduce motion", { exact: true }).isChecked(),
    true,
  );
  assert.equal(await page.locator(".cm-content").textContent(), text);
  await page.locator('button[aria-label="Body font"]').click();
  assert.equal(
    await picker.evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );
  await page.keyboard.press("Escape");
  await picker.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Close Preferences" }).click();
  assert.equal(
    await opener.evaluate((e) => e === document.activeElement),
    true,
  );
  await page.locator(".cm-content").focus();
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+z`);
  assert.equal(await page.locator(".cm-content").textContent(), "");
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+z" : "Control+y",
  );
  assert.equal(await page.locator(".cm-content").textContent(), text);
  await page.keyboard.press(`${mod}+,`);
  await preferences.waitFor();
  await page.keyboard.press("Escape");
  await preferences.waitFor({ state: "hidden" });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await placeTestWindow(app);
  await page.locator(".cm-content").waitFor();
  assert.equal(await page.locator(".cm-content").textContent(), text);
  await openPreferences(app, page);
  assert.equal(
    await page.getByLabel("Appearance", { exact: true }).inputValue(),
    "system",
  );
  assert.equal(
    await page.getByLabel("Reduce motion", { exact: true }).isChecked(),
    true,
  );
  assert.equal(
    await page.getByLabel("Background opacity", { exact: true }).inputValue(),
    "68",
  );
  assert.equal(
    await page.getByLabel("Text size", { exact: true }).inputValue(),
    "16",
  );
  await page.getByRole("button", { name: "Body font", exact: true }).click();
  const reopenedPicker = page.getByRole("dialog", { name: "Installed fonts" });
  await page.waitForFunction(() =>
    /\d+ installed families/.test(
      document.querySelector(".font-picker [role=status]").textContent,
    ),
  );
  const persistedFont = (
    await reopenedPicker.getByRole("option").nth(1).textContent()
  ).trim();
  await reopenedPicker.getByRole("option").nth(1).click();
  await reopenedPicker.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Source and code font", exact: true })
    .click();
  await reopenedPicker.getByRole("option").nth(1).click();
  await reopenedPicker.waitFor({ state: "hidden" });
  await page.getByLabel("Appearance", { exact: true }).selectOption("custom");
  await page.getByLabel("Accent hex", { exact: true }).fill("#ad3456");
  await page.getByLabel("Text size", { exact: true }).fill("22");
  await page.getByRole("button", { name: "Close Preferences" }).click();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await placeTestWindow(app);
  await page.locator(".cm-content").waitFor();
  assert.equal(await page.locator(".cm-content").textContent(), text);
  await openPreferences(app, page);
  assert.equal(
    await page
      .getByRole("button", { name: "Body font", exact: true })
      .textContent(),
    persistedFont,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Source and code font", exact: true })
      .textContent(),
    persistedFont,
  );
  assert.equal(
    await page.getByLabel("Appearance", { exact: true }).inputValue(),
    "custom",
  );
  assert.equal(
    await page.getByLabel("Accent hex", { exact: true }).inputValue(),
    "#ad3456",
  );
  assert.equal(
    await page.getByLabel("Text size", { exact: true }).inputValue(),
    "22",
  );
  assert.equal(
    await page.getByLabel("Reduce motion", { exact: true }).isChecked(),
    true,
  );
  console.log(
    "PASS: main menu, shortcut, font mouse/Enter commit, arrow/Escape/outside isolation, repeated focus, color/font/appearance resets, reduced motion, undo and draft/settings restart",
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0));
  await app.close();
}
