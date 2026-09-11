// Opt-in native compositor test. See CONTRIBUTING.md for the capture adapter setup.
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
import { menuCommand } from "./menu-helpers.mjs";

if (process.platform !== "darwin" || !process.env.DEFT_KOFFI_MODULE)
  throw Error(
    "Run on macOS with DEFT_KOFFI_MODULE pointing to the optional koffi module",
  );
await fs.mkdir(".scratch", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".scratch/mac-transparency-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DEFT_EXECUTABLE;
const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [
    ...(executablePath ? [] : ["."]),
    `--user-data-dir=${path.join(root, "profile")}`,
  ],
  env,
});
const results = [];
try {
  const page = await app.firstWindow();
  await page.locator(".cm-content").waitFor();
  const state = await app.evaluate(
    async ({ BrowserWindow, screen, nativeTheme, app }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const area = screen.getPrimaryDisplay().workArea;
      win.setBounds({
        x: area.x + 80,
        y: area.y + 80,
        width: 800,
        height: 600,
      });
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setAlwaysOnTop(true);
      const b = win.getBounds();
      const back = new BrowserWindow({
        x: b.x - 20,
        y: b.y - 20,
        width: b.width + 40,
        height: b.height + 40,
        frame: false,
        backgroundColor: "#000000",
        webPreferences: { sandbox: true },
      });
      await back.loadURL(
        "data:text/html,<style>html,body{margin:0;width:100%;height:100%;background:black}</style>",
      );
      back.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      back.setAlwaysOnTop(true);
      globalThis.deftBackdrop = back;
      globalThis.deftTestWindow = win;
      win.show();
      win.moveTop();
      win.focus();
      app.focus({ steal: true });
      return {
        reduced: nativeTheme.prefersReducedTransparency,
        contrast: nativeTheme.shouldUseHighContrastColors,
        resizable: win.isResizable(),
      };
    },
  );
  console.log(JSON.stringify({ root, ...state }));
  assert.ok(
    !state.reduced && !state.contrast,
    "Accessibility is requesting solid backgrounds",
  );
  assert.ok(state.resizable);
  await page.locator(".cm-content").fill("DEFT TRANSPARENCY CHECK");
  await page.evaluate(() => {
    const marker = document.createElement("div");
    marker.id = "capture-marker";
    marker.style.cssText =
      "position:fixed;left:20px;top:250px;width:20px;height:20px;background:#ff00ff;z-index:99999;pointer-events:none";
    document.body.append(marker);
  });
  async function configure(appearance, material, blur, opacity) {
    await menuCommand(app, page, "View", "Preferences…");
    await page
      .getByLabel("Appearance", { exact: true })
      .selectOption(appearance);
    await page.getByLabel("Material", { exact: true }).selectOption(material);
    if (material === "glass") {
      await page
        .getByLabel("Background blur", { exact: true })
        .setChecked(blur);
      await page
        .getByLabel("Background opacity", { exact: true })
        .fill(String(opacity));
    }
    await page
      .getByRole("button", { name: "Close Preferences", exact: true })
      .click();
    await page.evaluate(() => window.deft.settings({}));
  }
  async function response(label) {
    const samples = [];
    for (const color of ["#000000", "#ffffff"]) {
      const bounds = await app.evaluate(async ({ app }, color) => {
        await globalThis.deftBackdrop.webContents.executeJavaScript(
          `document.documentElement.style.background=${JSON.stringify(color)};document.body.style.background=${JSON.stringify(color)}`,
        );
        globalThis.deftTestWindow.show();
        globalThis.deftTestWindow.moveTop();
        globalThis.deftTestWindow.focus();
        app.focus({ steal: true });
        return globalThis.deftTestWindow.getBounds();
      }, color);
      await page.waitForTimeout(350);
      const file = path.join(root, `${label}-${color.slice(1)}.png`);
      const content = await app.evaluate(
        (_, { module, bounds, file }) => {
          const win = globalThis.deftTestWindow;
          process.mainModule.require(module)(
            Number(win.getMediaSourceId().split(":")[1]),
            bounds,
            file,
          );
          return win.getContentBounds();
        },
        { module: path.resolve("tests/mac-window-capture.cjs"), bounds, file },
      );
      const image = sharp(file).resize(bounds.width, bounds.height);
      const markerBuffer = await image
        .clone()
        .extract({
          left: content.x - bounds.x + 25,
          top: content.y - bounds.y + 255,
          width: 10,
          height: 10,
        })
        .toBuffer();
      const marker = await sharp(markerBuffer).stats();
      const markerRGB = marker.channels.slice(0, 3).map((c) => c.mean);
      assert.ok(
        markerRGB[0] > 245 && markerRGB[1] < 10 && markerRGB[2] > 245,
        `Mac must be unlocked; capture must contain the fully opaque test marker: ${markerRGB}`,
      );
      const sampleBuffer = await image
        .clone()
        .extract({ left: 550, top: 400, width: 40, height: 40 })
        .toBuffer();
      const stats = await sharp(sampleBuffer).stats();
      samples.push(stats.channels.slice(0, 3).map((c) => c.mean));
    }
    const delta =
      samples[1].reduce((n, c, i) => n + Math.abs(c - samples[0][i]), 0) / 3;
    results.push({ label, samples, delta });
    await fs.writeFile(
      path.join(root, "results.json"),
      JSON.stringify(results, null, 2),
    );
    console.log(`${label}: ${delta.toFixed(2)}`);
    return delta;
  }
  for (const appearance of ["light", "dark"]) {
    for (const blur of [true, false]) {
      for (const opacity of [0, 68, 95]) {
        await configure(appearance, "glass", blur, opacity);
        const delta = await response(
          `${appearance}-${blur ? "blur" : "clear"}-${opacity}`,
        );
        if (opacity === 0) assert.ok(delta > (blur ? 90 : 220));
        if (opacity === 68) assert.ok(delta > (blur ? 20 : 55) && delta < 100);
        if (opacity === 95) assert.ok(delta < 25);
      }
    }
    await configure(appearance, "solid", true, 68);
    assert.ok((await response(`${appearance}-solid`)) < 2);
  }
  await configure("light", "glass", false, 0);
  // Establish a rendered clear frame before resizing. Otherwise macOS can
  // resize a cached snapshot of the preferences panel we just closed.
  assert.ok((await response("clear-before-resize")) > 220);
  await app.evaluate(() => globalThis.deftTestWindow.setSize(740, 560));
  assert.ok((await response("clear-after-resize")) > 220);
  assert.equal(
    await app.evaluate(() => globalThis.deftTestWindow.getOpacity()),
    1,
    "Foreground must remain opaque",
  );
  console.log(
    "PASS Mac blur/clear opacity, solid isolation, opaque foreground marker and resize",
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0));
  await app.close();
}
