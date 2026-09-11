import { placeTestWindow } from "./window-placement.mjs";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = await fs.mkdtemp(path.resolve(".scratch/last-tab-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DEFT_EXECUTABLE;
const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [...(executablePath ? [] : ["."]), `--user-data-dir=${root}`],
  env,
});
try {
  const page = await app.firstWindow();
  await placeTestWindow(app);
  await page.locator(".cm-content").waitFor();
  await page
    .getByRole("button", { name: "Close Untitled", exact: true })
    .click();
  await page.locator(".empty").waitFor({ timeout: 3000 });
  assert.equal(await page.locator(".tab").count(), 0);
  await page.getByRole("button", { name: "New text tab", exact: true }).click();
  await page.locator(".cm-content").waitFor();
  assert.equal(await page.locator(".tab").count(), 1);
  await page
    .locator(".cm-content")
    .fill("Deliberately discarded synthetic draft");
  await page.keyboard.press(
    `${process.platform === "darwin" ? "Meta" : "Control"}+w`,
  );
  await page.locator(".empty").waitFor();
  await page
    .locator(".empty")
    .getByRole("button", { name: "New Text", exact: true })
    .click();
  await page.locator(".cm-content").waitFor();
  assert.equal(await page.locator(".cm-content").textContent(), "");
  await page
    .getByRole("button", { name: "Close Untitled", exact: true })
    .click();
  await page
    .locator(".empty")
    .getByRole("button", { name: "New Markdown", exact: true })
    .click();
  await page.locator(".cm-content").waitFor();
  assert.equal(await page.locator(".tab .filemark").textContent(), "M");
  console.log(
    "PASS last-tab close shows welcome; plus, New Text and New Markdown create one fresh tab; shortcut discards draft",
  );
} finally {
  await app.close();
}
