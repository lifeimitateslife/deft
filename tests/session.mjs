import { placeTestWindow } from "./window-placement.mjs";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = await fs.mkdtemp(path.resolve(".scratch/session-ui-"));
const profile = path.join(root, "profile");
const file = path.join(root, "雪 named note.txt");
const bytes = Buffer.from("\ufefforiginal\r\n");
await fs.writeFile(file, bytes);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DEFT_EXECUTABLE;
const mod = process.platform === "darwin" ? "Meta" : "Control";
let app;
async function launch(files = []) {
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [
      ...(executablePath ? [] : ["."]),
      `--user-data-dir=${profile}`,
      ...files,
    ],
    env,
  });
  const page = await app.firstWindow();
  await placeTestWindow(app);
  await page.locator(".cm-content").waitFor();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw Error("Unexpected routine close prompt");
    };
  });
  return page;
}
async function quit() {
  const exited = new Promise((resolve) => app.process().once("exit", resolve));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  let timer;
  try {
    await Promise.race([
      exited,
      new Promise(
        (_, reject) =>
          (timer = setTimeout(
            () => reject(Error("Normal quit did not exit")),
            10000,
          )),
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
  app = null;
}
try {
  let page = await launch([file]);
  await page.locator(".cm-content").fill("named unfinished");
  await page.keyboard.press(`${mod}+t`);
  await page.waitForFunction(
    () => document.querySelectorAll(".tab").length === 2,
  );
  await page.locator(".cm-content").fill("lyrics last keystroke 雪");
  await quit();
  assert.deepEqual(await fs.readFile(file), bytes);
  page = await launch();
  assert.equal(await page.locator(".tab").count(), 2);
  assert.equal(
    await page.locator(".cm-content").innerText(),
    "lyrics last keystroke 雪",
  );
  await page.keyboard.press(`${mod}+w`);
  await page.waitForFunction(
    () => document.querySelectorAll(".tab").length === 1,
  );
  assert.equal(
    await page.locator(".cm-content").innerText(),
    "named unfinished",
  );
  await quit();
  page = await launch();
  assert.equal(await page.locator(".tab").count(), 1);
  assert.equal(
    await page.locator(".cm-content").innerText(),
    "named unfinished",
  );
  await page.keyboard.press(`${mod}+w`);
  await page.waitForFunction(
    () => document.querySelector(".cm-content")?.textContent === "",
  );
  await quit();
  page = await launch();
  assert.equal(await page.locator(".tab").count(), 1);
  assert.equal(await page.locator(".cm-content").textContent(), "");
  assert.deepEqual(await fs.readFile(file), bytes);
  await app.evaluate(() => {
    const fs = process.getBuiltinModule("fs/promises");
    globalThis.originalRename = fs.rename;
    fs.rename = async (from, to) => {
      if (String(to).endsWith("session.json"))
        throw Error("Synthetic recovery write failure");
      return globalThis.originalRename(from, to);
    };
  });
  await page
    .locator(".cm-content")
    .fill("Keep this writing after a failed recovery");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await page
    .getByRole("status")
    .filter({ hasText: "Synthetic recovery write failure" })
    .waitFor();
  assert.equal(
    await page.locator(".cm-content").textContent(),
    "Keep this writing after a failed recovery",
  );
  await app.evaluate(() => {
    process.getBuiltinModule("fs/promises").rename = globalThis.originalRename;
  });
  assert.equal(await page.evaluate(() => document.body.inert), false);
  await page
    .locator(".cm-content")
    .fill("Recovery failure leaves editing available");
  await quit();
  page = await launch();
  await page.locator(".cm-content").fill("Snapshot before deliberate shutdown");
  await app.evaluate(() => {
    const fs = process.getBuiltinModule("fs/promises");
    globalThis.originalRename = fs.rename;
    fs.rename = async (from, to) => {
      if (String(to).endsWith("session.json")) {
        await new Promise((resolve) => {
          globalThis.releaseRecovery = resolve;
        });
        fs.rename = globalThis.originalRename;
      }
      return globalThis.originalRename(from, to);
    };
  });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await page.waitForFunction(() => document.body.inert);
  await page.keyboard.type(" must not enter the closing document");
  await page.keyboard.press(`${mod}+t`);
  assert.equal(await page.locator(".tab").count(), 1);
  assert.equal(
    await page.locator(".cm-content").textContent(),
    "Snapshot before deliberate shutdown",
  );
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    globalThis.originalClose = win.close.bind(win);
    win.close = () => {
      globalThis.closeDispatched = true;
    };
    while (!globalThis.releaseRecovery)
      await new Promise((resolve) => setTimeout(resolve, 10));
    globalThis.releaseRecovery();
  });
  await app.evaluate(async () => {
    while (!globalThis.closeDispatched)
      await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await page.keyboard.type(" must also remain blocked after close dispatch");
  assert.equal(await page.evaluate(() => document.body.inert), true);
  assert.equal(
    await page.locator(".cm-content").textContent(),
    "Snapshot before deliberate shutdown",
  );
  const closed = app.waitForEvent("close");
  await app.evaluate(() => globalThis.originalClose());
  await closed;
  app = null;
  page = await launch();
  assert.equal(await page.locator(".tab").count(), 1);
  assert.equal(
    await page.locator(".cm-content").textContent(),
    "Snapshot before deliberate shutdown",
  );
  await quit();
  console.log(
    "PASS delayed shutdown blocks intervening typing and tab creation; recovery failure unlocks writing; normal quit, latest keystroke, active/order, dirty named bytes, explicit discard and final blank tab",
  );
} finally {
  if (app) {
    await app
      .evaluate(() => {
        if (globalThis.originalRename)
          process.getBuiltinModule("fs/promises").rename =
            globalThis.originalRename;
      })
      .catch(() => {});
    await app.close();
  }
}
