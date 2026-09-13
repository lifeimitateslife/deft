import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { menuCommand } from "./menu-helpers.mjs";
import { placeTestWindow } from "./window-placement.mjs";
await fs.mkdir(".scratch", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".scratch/formatting-"));
for (const extension of ["md", "txt"]) {
  const file = path.join(root, `雪 formatting note.${extension}`);
  await fs.writeFile(file, "Alpha");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.DEFT_EXECUTABLE;
  const app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [
      ...(executablePath ? [] : ["."]),
      `--user-data-dir=${path.join(root, extension)}`,
      file,
    ],
    env,
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      globalThis.shortcutTrace = [];
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      const send = wc.send.bind(wc);
      wc.send = (channel, ...args) => {
        if (channel === "action")
          globalThis.shortcutTrace.push({ action: args[0] });
        return send(channel, ...args);
      };
      wc.on("before-input-event", (_, input) => {
        if (input.type === "keyDown") globalThis.shortcutTrace.push(input);
      });
    });
    await placeTestWindow(app);
    const editor = page.locator(".cm-content");
    await editor.waitFor();
    await page.evaluate(() => {
      globalThis.shortcutTrace = [];
      document.addEventListener(
        "keydown",
        (event) => {
          globalThis.shortcutTrace.push({
            key: event.key,
            code: event.code,
            meta: event.metaKey,
            alt: event.altKey,
            control: event.ctrlKey,
            altGraph: event.getModifierState("AltGraph"),
            focus: document.activeElement?.getAttribute("name"),
            text: document.querySelector(".cm-content")?.textContent,
            footer: document.querySelector("footer")?.textContent,
            notice: document.querySelector(".notice")?.textContent,
          });
        },
        true,
      );
    });
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await editor.click();
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.press(`${mod}+b`);
    await page.keyboard.press(`${mod}+s`);
    await waitForSave(page);
    await assertEventually(async () =>
      assert.equal(await fs.readFile(file, "utf8"), "**Alpha**"),
    );
    await page.waitForFunction(
      () => !document.querySelector("footer")?.textContent.includes("Saving"),
    );
    console.log("Selected Ctrl+B: PASS");
    await page.keyboard.press(`${mod}+b`);
    await page.keyboard.press(`${mod}+s`);
    await waitForSave(page);
    await assertEventually(async () =>
      assert.equal(await fs.readFile(file, "utf8"), "Alpha"),
    );
    await page.waitForFunction(
      () => !document.querySelector("footer")?.textContent.includes("Saving"),
    );
    console.log("Selected Ctrl+B toggle off: PASS");
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.press("Enter");
    await page.keyboard.press(`${mod}+b`);
    await page.keyboard.press(`${mod}+s`);
    await waitForSave(page);
    await assertEventually(async () =>
      assert.equal(
        await fs.readFile(file, "utf8"),
        "Alpha\n",
        "Enabling bold typing must not insert empty markers",
      ),
    );
    await page.waitForFunction(
      () => !document.querySelector("footer")?.textContent.includes("Saving"),
    );
    await page.keyboard.type("Bold typing");
    await page.keyboard.press(`${mod}+b`);
    await page.keyboard.type(" normal typing");
    await page.keyboard.press(`${mod}+s`);
    await waitForSave(page);
    await assertEventually(async () =>
      assert.equal(
        await fs.readFile(file, "utf8"),
        "Alpha\n**Bold typing** normal typing",
      ),
    );
    console.log(`${extension} caret bold typing on/off: PASS`);
    await page.waitForFunction(
      () => !document.querySelector("footer")?.textContent.includes("Saving"),
    );
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.type("Menu test");
    await page.keyboard.press(`${mod}+a`);
    await menuCommand(app, page, "Format", "Bold");
    await assertEventually(async () =>
      assert.equal(await editor.textContent(), "**Menu test**"),
    );
    await page.keyboard.press(`${mod}+z`);
    assert.equal(await editor.textContent(), "Menu test");
    await page.keyboard.press(`${mod}+Shift+Z`);
    assert.equal(await editor.textContent(), "**Menu test**");
    await page.keyboard.press(`${mod}+z`);
    await page.keyboard.press(`${mod}+y`);
    assert.equal(await editor.textContent(), "**Menu test**");
    await page.keyboard.press(`${mod}+z`);
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.press(`${mod}+i`);
    assert.equal(await editor.textContent(), "*Menu test*");
    await page.keyboard.press(`${mod}+i`);
    assert.equal(await editor.textContent(), "Menu test");
    await page.keyboard.press(`${mod}+Alt+1`);
    assert.equal(await editor.textContent(), "# Menu test");
    await page.keyboard.press(`${mod}+z`);
    await page.keyboard.press(`${mod}+Shift+8`);
    assert.equal(await editor.textContent(), "- Menu test");
    await page.keyboard.press(`${mod}+z`);
    await page.keyboard.press(`${mod}+End`);
    await menuCommand(app, page, "Format", "Insert table");
    // Observe menu delivery in Live view, then read the exact saved source.
    await page.waitForFunction(
      () =>
        document.querySelector(".cm-content")?.textContent.includes("Column"),
      null,
      { timeout: 3000 },
    );
    await page.keyboard.press(`${mod}+s`);
    await waitForSave(page);
    assert.ok(
      (await fs.readFile(file, "utf8")).includes("| Column | Column |"),
    );
    await page.keyboard.press(`${mod}+z`);
    await page.keyboard.press(`${mod}+a`);
    await app.evaluate(({ BrowserWindow }, mac) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      wc.sendInputEvent({
        type: "keyDown",
        keyCode: "B",
        modifiers: [mac ? "meta" : "control"],
      });
      wc.sendInputEvent({
        type: "keyUp",
        keyCode: "B",
        modifiers: [mac ? "meta" : "control"],
      });
    }, process.platform === "darwin");
    await assertEventually(async () =>
      assert.equal(
        await editor.textContent(),
        "**Menu test**",
        "Native input must apply bold exactly once",
      ),
    );
    await page.keyboard.press(`${mod}+s`);
    await waitForSave(page);
    await assertEventually(async () =>
      assert.equal(await fs.readFile(file, "utf8"), "**Menu test**"),
    );
    await page.waitForFunction(
      () => !document.querySelector("footer")?.textContent.includes("Saving"),
    );
    await page.keyboard.press(`${mod}+Backquote`);
    assert.equal(
      await page
        .locator(".document")
        .evaluate((e) => e.classList.contains("source")),
      true,
    );
    await page.keyboard.press(`${mod}+Backquote`);
    assert.equal(
      await page
        .locator(".document")
        .evaluate((e) => e.classList.contains("live")),
      true,
    );
    assert.equal((await editor.locator(".live-strong").count()) > 0, true);
    await page.keyboard.press(`${mod}+g`);
    await page.locator(".cm-panel").waitFor();
    await page.keyboard.press("Escape");
    await editor.focus();
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+Alt+f" : "Control+h",
    );
    await assertEventually(async () =>
      assert.equal(
        await page
          .locator('input[name="replace"]')
          .evaluate((e) => e === document.activeElement),
        true,
      ),
    );
    await page.keyboard.press("Escape");
    console.log(
      `${extension}: menu, undo/redo, italic, heading, bullet, table, native input, source toggle, find/replace PASS`,
    );
    await editor.focus();
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.press("Backspace");
    await page.keyboard.press(`${mod}+b`);
    await page.keyboard.type("one");
    await page.keyboard.press(`${mod}+i`);
    await page.keyboard.type("two");
    await page.keyboard.press(`${mod}+i`);
    await page.keyboard.type("three");
    await page.keyboard.press(`${mod}+b`);
    await page.keyboard.type("plain");
    assert.equal(await editor.textContent(), "**one*two*three**plain");
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.press("Backspace");
    await page.keyboard.press(`${mod}+b`);
    await page.keyboard.type("x");
    await page.keyboard.press("Backspace");
    assert.equal(await editor.textContent(), "");
    await page.keyboard.press(`${mod}+b`);
    await page.keyboard.type("**abcd**");
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press(`${mod}+b`);
    await page.keyboard.type("X");
    assert.equal(await editor.textContent(), "**ab**X**cd**");
    console.log(
      `${extension}: nested typing, deleting empty formatting, interior caret toggle PASS`,
    );
    for (const [source, key, offset, expected, tag] of [
      ["__abcd__", "b", 4, "**ab**X**cd**", "strong"],
      ["_abcd_", "i", 3, "*ab*X*cd*", "em"],
      ["``abcd``", "e", 4, "``ab``X``cd``", "code"],
    ]) {
      await page.keyboard.press(`${mod}+a`);
      await page.keyboard.type(source);
      await page.keyboard.press("Home");
      for (let i = 0; i < offset; i++) await page.keyboard.press("ArrowRight");
      await page.keyboard.press(`${mod}+${key}`);
      await page.keyboard.type("X");
      assert.equal(await editor.textContent(), expected);
      await menuCommand(app, page, "View", "Read");
      await assertEventually(async () =>
        assert.deepEqual(
          await page.locator(`article ${tag}`).allTextContents(),
          ["ab", "cd"],
        ),
      );
      await menuCommand(app, page, "View", "Live");
      await editor.focus();
    }
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.type("**ab**X**cd**");
    await page.keyboard.press(`${mod}+s`);
    await waitForSave(page);
    await assertEventually(async () =>
      assert.equal(await fs.readFile(file, "utf8"), "**ab**X**cd**"),
    );
    await page.waitForFunction(
      () => !document.querySelector("footer")?.textContent.includes("Saving"),
    );
    await page.keyboard.press(`${mod}+w`);
    await assertEventually(async () =>
      assert.equal(
        await page
          .getByRole("button", {
            name: `Close ${path.basename(file)}`,
            exact: true,
          })
          .count(),
        0,
      ),
    );
    await page
      .getByRole("button", { name: "Application menu", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Recent files", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: path.basename(file), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: `Close ${path.basename(file)}`,
        exact: true,
      })
      .waitFor();
    if (extension === "txt") {
      assert.equal(await page.locator(".document.source").count(), 1);
      await page.keyboard.press(`${mod}+Backquote`);
    }
    assert.equal((await editor.locator(".live-strong").count()) > 0, true);
    assert.equal(await fs.readFile(file, "utf8"), "**ab**X**cd**");
    const count = await page.locator(".tab").count();
    await page.keyboard.press(`${mod}+n`);
    await assertEventually(async () =>
      assert.equal(await page.locator(".tab").count(), count + 1),
    );
    // The tab appears before React's effect replaces the previous editor.
    // Wait for the new blank document before focusing and sending keystrokes.
    await assertEventually(async () =>
      assert.equal(await editor.textContent(), ""),
    );
    await editor.focus();
    await page.keyboard.type("Untitled text");
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.press(`${mod}+b`);
    assert.equal(await editor.textContent(), "**Untitled text**");
    await page.keyboard.press(`${mod}+b`);
    assert.equal(await editor.textContent(), "Untitled text");
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.press(`${mod}+i`);
    await page.keyboard.type(" italic");
    await page.keyboard.press(`${mod}+i`);
    await page.keyboard.type(" normal");
    assert.equal(await editor.textContent(), "Untitled text *italic* normal");
    await page.keyboard.press(`${mod}+Shift+N`);
    await assertEventually(async () =>
      assert.equal(await page.locator(".tab").count(), count + 2),
    );
    await page.keyboard.press("Control+Shift+Tab");
    assert.ok((await editor.textContent()).includes("Untitled text"));
    await page.keyboard.press("Control+Tab");
    assert.equal(await editor.textContent(), "");
    await page.keyboard.press(`${mod}+t`);
    await assertEventually(async () =>
      assert.equal(await page.locator(".tab").count(), count + 3),
    );
    await page.keyboard.press("F11");
    await assertEventually(async () =>
      assert.equal(
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isFullScreen(),
        ),
        true,
      ),
    );
    await page.keyboard.press("F11");
    await assertEventually(async () =>
      assert.equal(
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isFullScreen(),
        ),
        false,
      ),
    );
    console.log(
      `${extension}: saved file reopen, explicit formatted view, untitled formatting, new/tab shortcuts PASS`,
    );
  } catch (error) {
    const page = await app.firstWindow();
    console.error(
      "Shortcut failure diagnostics",
      JSON.stringify(
        {
          native: await app.evaluate(() => globalThis.shortcutTrace.slice(-25)),
          renderer: await page.evaluate(() => ({
            keys: globalThis.shortcutTrace.slice(-25),
            focus: document.activeElement?.outerHTML.slice(0, 200),
            text: document.querySelector(".cm-content")?.textContent,
            footer: document.querySelector("footer")?.textContent,
            notice: document.querySelector(".notice")?.textContent,
          })),
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await app.close();
  }
}
async function assertEventually(check) {
  for (let n = 0; n < 30; n++) {
    try {
      await check();
      return;
    } catch (error) {
      if (n === 29) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function waitForSave(page) {
  // Reading the destination during atomic replacement can contend on Windows.
  // A visible save failure must still fail this barrier and retain its diagnostic.
  await page.waitForFunction(
    () => document.querySelector("footer > span")?.textContent === "Saved",
    null,
    { timeout: 3000 },
  );
}
