// Only the controlled test window is retained in captures. Run on an unlocked
// Windows desktop; a renderer screenshot cannot prove a DWM backdrop effect.
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
import { placeTestWindow } from "./window-placement.mjs";

assert.equal(process.platform, "win32");
await fs.mkdir(".scratch", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".scratch/windows-blur-strength-"));
const profile = path.join(root, "profile");
await fs.mkdir(profile);
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({
    material: "glass",
    appearance: "light",
    glassOpacity: 0,
    backgroundBlurStrength: 0,
  }),
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DEFT_EXECUTABLE;
const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [...(executablePath ? [] : ["."]), `--user-data-dir=${profile}`],
  env,
});
const results = [];
try {
  const page = await app.firstWindow();
  await placeTestWindow(app);
  await page.locator(".cm-content").waitFor();
  const host = await app.evaluate(async ({ BrowserWindow, screen, app }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setSize(800, 600);
    const back = new BrowserWindow({
      ...win.getBounds(),
      frame: false,
      show: false,
      title: "DEFT controlled blur backdrop",
      webPreferences: { sandbox: true },
    });
    await back.loadURL(
      "data:text/html," +
        encodeURIComponent(
          "<style>body{margin:0;height:100vh;background:repeating-linear-gradient(90deg,#000 0px,#000 24px,#fff 24px,#fff 48px)}</style>",
        ),
    );
    win.setParentWindow(back);
    back.showInactive();
    win.show();
    win.moveTop();
    win.focus();
    globalThis.windowsBlurTest = { win, back };
    return {
      version: app.getVersion(),
      packaged: app.isPackaged,
      os: require("node:os").release(),
      display: screen.getDisplayMatching(win.getBounds()),
    };
  });
  console.log(JSON.stringify(host));
  await page.evaluate(() => {
    const marker = document.createElement("div");
    marker.id = "blur-foreground-marker";
    marker.style.cssText =
      "position:fixed;left:30px;top:250px;width:160px;height:32px;background:repeating-linear-gradient(90deg,#ff00ff 0px,#ff00ff 4px,#00ff00 4px,#00ff00 8px);z-index:99999;pointer-events:none";
    document.body.append(marker);
  });
  async function sample(strength, label = String(strength)) {
    const support = await page.evaluate(async (strength) => {
      await window.deft.settings({ backgroundBlurStrength: strength });
      return window.deft.material((await window.deft.settings()).material);
    }, strength);
    await page.waitForTimeout(600);
    const capture = await app.evaluate(async ({ desktopCapturer, screen }) => {
      const { win, back } = globalThis.windowsBlurTest;
      if (!win.isVisible() || win.isMinimized() || !back.isVisible())
        throw Error("Test windows are not visible");
      const bounds = win.getContentBounds();
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
        width: bounds.width,
        height: bounds.height,
        png: source.thumbnail
          .crop({
            x: Math.round((bounds.x - display.bounds.x) * scale),
            y: Math.round((bounds.y - display.bounds.y) * scale),
            width: Math.round(bounds.width * scale),
            height: Math.round(bounds.height * scale),
          })
          .toPNG()
          .toString("base64"),
        focused: win.isFocused(),
        opacity: win.getOpacity(),
      };
    });
    const bytes = await sharp(Buffer.from(capture.png, "base64"))
      .resize(capture.width, capture.height)
      .png()
      .toBuffer();
    const foreground = await sharp(bytes)
      .extract({ left: 30, top: 250, width: 160, height: 32 })
      .raw()
      .toBuffer();
    const marker = await sharp(bytes)
      .extract({ left: 31, top: 254, width: 2, height: 2 })
      .stats();
    const rgb = marker.channels.slice(0, 3).map((c) => c.mean);
    assert.ok(
      rgb[0] > 245 && rgb[1] < 10 && rgb[2] > 245,
      `Foreground marker missing: ${rgb}`,
    );
    const stats = await sharp(bytes)
      .extract({ left: 340, top: 320, width: 240, height: 120 })
      .stats();
    const row = {
      label,
      strength,
      contrast: stats.channels[0].stdev,
      mean: stats.channels[0].mean,
      foreground: rgb,
      windowOpacity: capture.opacity,
      focused: capture.focused,
      support,
    };
    results.push(row);
    await fs.writeFile(path.join(root, `${label}.png`), bytes);
    await fs.writeFile(
      path.join(root, "results.json"),
      JSON.stringify({ host, results }, null, 2),
    );
    console.log(JSON.stringify(row));
    return { ...row, foregroundBytes: foreground };
  }
  const levels = [];
  for (const strength of [0, 10, 30, 60, 100])
    levels.push(await sample(strength));
  assert.ok(
    levels.every((level) => level.support.blurStrengthSupported),
    "Native strength unavailable",
  );
  assert.ok(levels[0].contrast > 100, "Zero must preserve clear detail");
  for (let i = 1; i < levels.length; i++) {
    assert.ok(
      levels[i - 1].contrast - levels[i].contrast > 3,
      "Every sampled strength must increase blur",
    );
    assert.ok(
      Math.abs(levels[i].mean - levels[0].mean) < 4,
      "Blur must not change background luminance",
    );
    assert.deepEqual(
      levels[i].foregroundBytes,
      levels[0].foregroundBytes,
      "Foreground must remain sharp and opaque",
    );
    assert.equal(levels[i].windowOpacity, 1);
  }
  assert.ok(levels[4].contrast < levels[0].contrast * 0.2);
  await app.evaluate(() => globalThis.windowsBlurTest.win.setSize(760, 560));
  const resized = await sample(30, "resized");
  assert.ok(Math.abs(resized.contrast - levels[2].contrast) < 5);
  await app.evaluate(() => globalThis.windowsBlurTest.back.focus());
  const inactive = await sample(30, "inactive");
  assert.equal(inactive.focused, false);
  assert.ok(Math.abs(inactive.contrast - levels[2].contrast) < 5);
  await app.evaluate(async () => {
    const { win } = globalThis.windowsBlurTest;
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
  assert.ok(
    Math.abs((await sample(30, "restored")).contrast - levels[2].contrast) < 5,
  );
  await page.evaluate(() => window.deft.settings({ material: "solid" }));
  assert.ok((await sample(60, "solid")).contrast < 1);
  console.log(`PASS packaged Windows blur evidence: ${root}`);
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await app.close();
}
