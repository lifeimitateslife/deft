import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { placeTestWindow } from "./window-placement.mjs";
const root = await fs.mkdtemp(path.resolve(".scratch/save-in-flight-"));
const file = path.join(root, "雪 save note.txt");
await fs.writeFile(file, "Original");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DEFT_EXECUTABLE;
const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [
    ...(executablePath ? [] : ["."]),
    `--user-data-dir=${path.join(root, "profile")}`,
    file,
  ],
  env,
});
try {
  const page = await app.firstWindow();
  await placeTestWindow(app);
  const editor = page.locator(".cm-content");
  await editor.waitFor();
  await app.evaluate(async ({ app }) => {
    const { createRequire } = process.getBuiltinModule("module");
    const require = createRequire(app.getAppPath() + "/package.json");
    const { DocumentStore } = require("./desktop/storage.cjs");
    const save = DocumentStore.prototype.save;
    let first = true;
    DocumentStore.prototype.save = async function (...args) {
      if (first) {
        first = false;
        await new Promise((resolve) => (globalThis.releaseSave = resolve));
      }
      return save.apply(this, args);
    };
  });
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await editor.fill("First save");
  await page.keyboard.press(`${mod}+s`);
  await page.waitForFunction(() =>
    document.querySelector("footer").textContent.includes("Saving"),
  );
  await editor.fill("Latest writing after the first save started");
  await page.keyboard.press(`${mod}+s`);
  await app.evaluate(() => globalThis.releaseSave());
  await page.waitForFunction(
    () => document.querySelector("footer").textContent.startsWith("Saved"),
    null,
    { timeout: 5000 },
  );
  assert.equal(
    await fs.readFile(file, "utf8"),
    "Latest writing after the first save started",
  );
  console.log(
    "PASS a second explicit Save waits for the first and writes the latest buffer",
  );
} finally {
  await app.close();
}
