import { placeTestWindow } from "./window-placement.mjs";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = await fs.mkdtemp(path.resolve(".scratch/tabs-recents-"));
const profile = path.join(root, "profile");
const first = path.join(root, "first", "note.txt");
const second = path.join(root, "second", "note.txt");
const third = path.join(root, "third.txt");
for (const [file, text] of [
  [first, "first note"],
  [second, "second note"],
  [third, "third note"],
]) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DEFT_EXECUTABLE;
const mod = process.platform === "darwin" ? "Meta" : "Control";
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
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("Quit did not finish")), 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  app = null;
}
async function order(page) {
  return page
    .locator(".tab > button:first-child")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.title.split("\n")[0]),
    );
}
async function expectOrder(page, expected) {
  await page.waitForFunction(
    (expected) =>
      JSON.stringify(
        [...document.querySelectorAll(".tab > button:first-child")].map(
          (button) => button.title.split("\n")[0],
        ),
      ) === JSON.stringify(expected),
    expected,
  );
  assert.deepEqual(await order(page), expected);
}
try {
  let page = await launch();
  const recent = () =>
    page.getByRole("button", { name: "Recent files", exact: true });
  await recent().click();
  await page.getByText("No recent files", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: files,
      });
    },
    [first, second, third],
  );
  await page.keyboard.press(`${mod}+o`);
  await expectOrder(page, ["Unsaved document", first, second, third]);
  await page.locator(".tab").first().locator("button").last().click();
  await expectOrder(page, [first, second, third]);
  await page.locator(".tab > button:first-child").nth(2).click();
  await page.locator(".cm-content").fill("third unfinished 雪");
  const selection = await page
    .locator(".cm-content")
    .evaluate(() => getSelection()?.toString());
  // A real mouse drag moves a background tab without replacing the active editor.
  await page
    .locator(".tab > button:first-child")
    .nth(0)
    .dragTo(page.locator(".tab").nth(2));
  await expectOrder(page, [second, third, first]);
  assert.equal(
    await page.locator(".cm-content").innerText(),
    "third unfinished 雪",
  );
  assert.equal(
    await page
      .locator(".tab.active > button:first-child")
      .getAttribute("title"),
    `${third}\nDrag to reorder. Alt+Left/Right moves a focused tab.`,
  );
  assert.equal(
    await page
      .locator(".cm-content")
      .evaluate(() => getSelection()?.toString()),
    selection,
  );
  await page
    .locator(".tab > button:first-child")
    .nth(2)
    .dragTo(page.locator(".tab").nth(0));
  await expectOrder(page, [first, second, third]);
  // Keyboard movement works at boundaries and retains the focused tab.
  await page.locator(".tab > button:first-child").nth(1).focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await expectOrder(page, [second, first, third]);
  assert.equal(
    await page
      .locator(".tab > button:first-child")
      .nth(0)
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Alt+ArrowLeft");
  await expectOrder(page, [second, first, third]);
  await recent().click();
  const menu = page.getByRole("menu", { name: "recent", exact: true });
  assert.equal(
    await menu.getByRole("menuitem", { name: "note.txt", exact: true }).count(),
    2,
  );
  await menu.locator(`button[title=${JSON.stringify(first)}]`).click();
  await expectOrder(page, [second, first, third]);
  await page.waitForFunction(
    () => document.querySelector(".cm-content")?.textContent === "first note",
  );
  assert.equal(await page.locator(".cm-content").innerText(), "first note");
  await page.locator(".tab > button:first-child").nth(2).click();
  await page.locator(".cm-content").press(`${mod}+z`);
  assert.equal(await page.locator(".cm-content").innerText(), "third note");
  await page.locator(".cm-content").fill("restored draft");
  await quit();
  page = await launch();
  await expectOrder(page, [second, first, third]);
  assert.equal(await page.locator(".cm-content").innerText(), "restored draft");
  // Reopen a closed recent file while other tabs and their dirty draft stay open.
  await page
    .locator(".tab")
    .nth(0)
    .getByRole("button", { name: "Close note.txt", exact: true })
    .click();
  await recent().click();
  await page
    .getByRole("menu", { name: "recent", exact: true })
    .locator(`button[title=${JSON.stringify(second)}]`)
    .click();
  await expectOrder(page, [first, third, second]);
  assert.equal(await page.locator(".cm-content").innerText(), "second note");
  await page.locator(".tab > button:first-child").nth(1).click();
  assert.equal(await page.locator(".cm-content").innerText(), "restored draft");
  await recent().click();
  await page.locator(".application-popup").evaluate(async (el) => {
    await Promise.all(
      el.getAnimations().map((animation) => animation.finished),
    );
  });
  await page.screenshot({ path: path.join(root, "recent-files.png") });
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .locator(".cm-content")
      .evaluate((el) => el.contains(document.activeElement)),
    true,
  );
  // Missing recent paths use the existing error flow and do not remove open work.
  await page
    .locator(".tab")
    .nth(2)
    .getByRole("button", { name: "Close note.txt", exact: true })
    .click();
  await fs.unlink(second);
  await app.evaluate(({ dialog }) => {
    globalThis.missingRecent = false;
    dialog.showMessageBox = async (_win, options) => {
      globalThis.missingRecent = options.message === "Could not open file";
      return { response: 0 };
    };
  });
  await recent().click();
  await page
    .getByRole("menu", { name: "recent", exact: true })
    .locator(`button[title=${JSON.stringify(second)}]`)
    .click();
  await page.waitForFunction(
    () => document.querySelector(".application-popup").hidden,
  );
  await page.evaluate(() => window.deft.settings());
  assert.equal(await app.evaluate(() => globalThis.missingRecent), true);
  await expectOrder(page, [first, third]);
  assert.equal(await page.locator(".cm-content").innerText(), "restored draft");
  assert.equal(await fs.readFile(third, "utf8"), "third note");
  await quit();
  console.log(
    "PASS: drag and keyboard tab ordering, boundaries, undo, active draft, restart persistence, recent files with open tabs, duplicate names, missing paths and focus.",
  );
} finally {
  if (app) await app.close();
}
