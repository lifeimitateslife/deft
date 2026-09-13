import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
import { placeTestWindow } from "./window-placement.mjs";
import { openPreferences } from "./menu-helpers.mjs";
await fs.mkdir(".scratch", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".scratch/titlebar-"));
const profile = path.join(root, "profile");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DEFT_EXECUTABLE;
const compositor = process.platform === "win32" || !!env.DEFT_KOFFI_MODULE;
const results = [];
let app, page;
async function launch() {
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [...(executablePath ? [] : ["."]), `--user-data-dir=${profile}`],
    env,
  });
  page = await app.firstWindow();
  await placeTestWindow(app);
  await page.locator(".cm-content").waitFor();
  await assert.equal(await page.locator(".title-bar").textContent(), "");
  await assert.equal(await page.locator(".title-bar img, .title-bar svg").count(), 0);
  await app.evaluate(({ BrowserWindow }) => {
    globalThis.titlebarMain = BrowserWindow.getAllWindows()[0];
  });
}
async function capture(label) {
  const file = path.join(root, `${label}.png`);
  const info = await app.evaluate(
    async ({ desktopCapturer, screen }, { file, macCapture }) => {
      const { win } = globalThis.titlebarTest;
      const bounds = win.getBounds(),
        content = win.getContentBounds();
      if (process.platform === "darwin") {
        process.mainModule.require(macCapture)(
          Number(win.getMediaSourceId().split(":")[1]),
          bounds,
          file,
        );
        return { bounds, content };
      }
      const display = screen.getDisplayMatching(bounds);
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: Math.round(display.size.width * display.scaleFactor),
          height: Math.round(display.size.height * display.scaleFactor),
        },
      });
      const source = sources.find((s) => s.display_id === String(display.id));
      if (!source || source.thumbnail.isEmpty())
        throw Error("Desktop capture unavailable");
      const scale = source.thumbnail.getSize().width / display.size.width;
      return {
        bounds,
        content,
        png: source.thumbnail
          .crop({
            x: Math.round((content.x - display.bounds.x) * scale),
            y: Math.round((content.y - display.bounds.y) * scale),
            width: Math.round(content.width * scale),
            height: Math.round(content.height * scale),
          })
          .toPNG()
          .toString("base64"),
      };
    },
    { file, macCapture: path.resolve("tests/mac-window-capture.cjs") },
  );
  const bytes = info.png
    ? await sharp(Buffer.from(info.png, "base64"))
        .resize(info.content.width, info.content.height)
        .png()
        .toBuffer()
    : await sharp(file)
        .resize(info.bounds.width, info.bounds.height)
        .extract({
          left: info.content.x - info.bounds.x,
          top: info.content.y - info.bounds.y,
          width: info.content.width,
          height: info.content.height,
        })
        .png()
        .toBuffer();
  await fs.writeFile(file, bytes);
  const stats = await sharp(
    await sharp(bytes)
      .extract({ left: 96, top: 8, width: 256, height: 16 })
      .toBuffer(),
  ).stats();
  const row = {
    label,
    contrast: stats.channels[0].stdev,
    mean: stats.channels[0].mean,
  };
  results.push(row);
  await fs.writeFile(
    path.join(root, "results.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(row);
  return row;
}
async function settle() {
  await page.waitForTimeout(650);
}
try {
  await launch();
  await page
    .getByRole("button", { name: "Application menu", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Recent files", exact: true })
    .waitFor();
  await page.getByRole("menuitem", { name: "File", exact: true }).click();
  assert.equal(
    await page.getByRole("menuitem", { name: /Recent/i }).count(),
    0,
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await app.evaluate(
      ({ Menu }) =>
        Menu.getApplicationMenu()
          ?.items.find((i) => i.label === "File")
          ?.submenu.items.some((i) => /recent/i.test(i.label)) || false,
    ),
    false,
  );
  await openPreferences(app, page);
  const toggle = () =>
    page.getByRole("checkbox", { name: "Translucent title bar", exact: true });
  assert.equal(await toggle().isChecked(), false);
  await toggle().check();
  await page.getByLabel("Material", { exact: true }).selectOption("glass");
  await page.getByLabel("Appearance", { exact: true }).selectOption("light");
  await page.getByLabel("Background opacity", { exact: true }).fill("0");
  if (compositor) {
    await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setSize(800, 600);
      const back = new BrowserWindow({
        ...win.getBounds(),
        frame: false,
        show: false,
        webPreferences: { sandbox: true },
      });
      await back.loadURL(
        "data:text/html," +
          encodeURIComponent(
            // Match each platform's existing blur regression fixture: macOS's
            // radius kernel needs finer detail to resolve its low-end steps.
            `<style>body{margin:0;height:100vh;background:repeating-linear-gradient(90deg,#000 0px,#000 ${process.platform === "darwin" ? 24 : 64}px,#fff ${process.platform === "darwin" ? 24 : 64}px,#fff ${process.platform === "darwin" ? 48 : 128}px)}</style>`,
          ),
      );
      if (process.platform === "win32") win.setParentWindow(back);
      else {
        back.setAlwaysOnTop(true);
        win.setAlwaysOnTop(true);
      }
      back.showInactive();
      win.show();
      win.moveTop();
      win.focus();
      globalThis.titlebarTest = { win, back };
    });
    const levels = [];
    for (const strength of [0, 10, 30, 60, 100]) {
      await page
        .getByRole("slider", { name: "Background blur", exact: true })
        .fill(String(strength));
      await settle();
      levels.push(await capture(`blur-${strength}`));
    }
    assert.ok(levels[0].contrast > 100, "Title bar zero must be clear");
    for (let i = 1; i < levels.length; i++)
      assert.ok(
        levels[i - 1].contrast - levels[i].contrast > 2,
        "Title blur strengths must be distinct",
      );
    await page
      .getByRole("slider", { name: "Background blur", exact: true })
      .fill("0");
    await page.getByLabel("Background opacity", { exact: true }).fill("68");
    await settle();
    const fill = await capture("opacity-68");
    assert.ok(fill.contrast > 20 && fill.contrast < 55);
    await toggle().uncheck();
    await settle();
    assert.ok((await capture("opaque-off")).contrast < 1);
    await toggle().check();
    await page.getByLabel("Material", { exact: true }).selectOption("solid");
    await settle();
    assert.ok((await capture("solid")).contrast < 1);
    await page.getByLabel("Material", { exact: true }).selectOption("glass");
  }
  for (const property of [
    "shouldUseHighContrastColors",
    "prefersReducedTransparency",
  ]) {
    await app.evaluate(({ nativeTheme }, property) => {
      Object.defineProperty(nativeTheme, property, {
        get: () => true,
        configurable: true,
      });
      nativeTheme.emit("updated");
    }, property);
    await page.waitForFunction(
      () => document.querySelector("main").dataset.glass === "false",
    );
    assert.equal(await toggle().isChecked(), true);
    await app.evaluate(({ nativeTheme }, property) => {
      delete nativeTheme[property];
      nativeTheme.emit("updated");
    }, property);
  }
  await page.getByLabel("Background opacity", { exact: true }).fill("68");
  await page
    .getByRole("button", { name: "Close Preferences", exact: true })
    .click();
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = globalThis.titlebarMain;
    win.setSize(760, 560);
    await new Promise((resolve) => {
      win.once("minimize", resolve);
      win.minimize();
    });
    await new Promise((resolve) => {
      win.once("restore", resolve);
      win.restore();
    });
    win.focus();
  });
  await page.screenshot({ path: path.join(root, "restored.png") });
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = globalThis.titlebarMain;
    await new Promise((resolve) => {
      win.once("maximize", resolve);
      win.maximize();
    });
    await new Promise((resolve) => {
      win.once("unmaximize", resolve);
      win.unmaximize();
    });
    await new Promise((resolve) => {
      win.once("enter-full-screen", resolve);
      win.setFullScreen(true);
    });
  });
  await page.waitForFunction(() => document.querySelector(".title-bar").hidden);
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = globalThis.titlebarMain;
    await new Promise((resolve) => {
      win.once("leave-full-screen", resolve);
      win.setFullScreen(false);
    });
  });
  await page.waitForFunction(
    () => !document.querySelector(".title-bar").hidden,
  );
  await page.evaluate(() => window.deft.settings());
  await app.evaluate(({ app }) => app.exit(0));
  app = null;
  await launch();
  await openPreferences(app, page);
  assert.equal(await toggle().isChecked(), true);
  assert.equal(
    await page.getByLabel("Background opacity", { exact: true }).inputValue(),
    "68",
  );
  console.log(
    `PASS titlebar menu, toggle, persistence, lifecycle and accessibility; compositor=${compositor}: ${root}`,
  );
} finally {
  if (app) {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close();
  }
}
