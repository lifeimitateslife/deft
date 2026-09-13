import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = await fs.mkdtemp(path.resolve(".scratch/mac-blur-ui-"));
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
  await page.locator(".cm-content").waitFor();
  await page.keyboard.press("Meta+,");
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
  await app.evaluate(({ app }) => app.exit(0));
  app = null;
  page = await launch();
  blur = page.getByRole("slider", { name: "Background blur", exact: true });
  assert.equal(await blur.inputValue(), "73");
  await page.screenshot({ path: path.join(root, "slider.png") });
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
  console.log(
    "PASS Mac blur slider: intermediate setting, persistence, independent opacity, zero, reset, revert and solid disabling",
  );
} finally {
  if (app) await app.evaluate(({ app }) => app.exit(0));
}
