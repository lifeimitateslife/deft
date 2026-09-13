// Measures only controlled windows owned by this isolated test application.
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
if (process.platform !== "darwin" || !process.env.DEFT_KOFFI_MODULE)
  throw Error("Mac capture adapter required");
const root = await fs.mkdtemp(path.resolve(".scratch/mac-blur-strength-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DEFT_EXECUTABLE;
await fs.mkdir(path.join(root, "profile"), { recursive: true });
await fs.writeFile(
  path.join(root, "profile", "settings.json"),
  JSON.stringify({
    material: "glass",
    appearance: "light",
    glassOpacity: 0,
    backgroundBlurStrength: 0,
  }),
);
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
  await app.evaluate(async ({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0],
      area = screen.getPrimaryDisplay().workArea;
    win.setBounds({ x: area.x + 80, y: area.y + 80, width: 800, height: 600 });
    const bounds = win.getBounds();
    const back = new BrowserWindow({
      ...bounds,
      frame: false,
      webPreferences: { sandbox: true },
    });
    await back.loadURL(
      "data:text/html,<style>html{background:repeating-linear-gradient(90deg,black 0px,black 24px,white 24px,white 48px);height:100%}</style>",
    );
    globalThis.blurTest = { win, back };
    back.setAlwaysOnTop(true);
    win.setAlwaysOnTop(true);
    win.show();
    win.moveTop();
    win.focus();
  });
  await page.evaluate(async () => {
    await window.deft.settings({
      material: "glass",
      appearance: "light",
      glassOpacity: 0,
      backgroundBlurStrength: 0,
    });
    const marker = document.createElement("div");
    marker.style.cssText =
      "position:fixed;left:20px;top:250px;width:20px;height:20px;background:#ff00ff;z-index:99999";
    document.body.append(marker);
  });
  async function sample(strength, label = String(strength)) {
    await page.evaluate(async (strength) => {
      await window.deft.settings({ backgroundBlurStrength: strength });
      const support = await window.deft.material(
        (await window.deft.settings()).material,
      );
      if (!support.blurStrengthSupported)
        throw Error("Native adjustable blur unavailable");
    }, strength);
    await page.waitForTimeout(400);
    const file = path.join(root, `${label}.png`);
    const { bounds, content } = await app.evaluate(
      (_, { file, capture }) => {
        const win = globalThis.blurTest.win;
        process.mainModule.require(capture)(
          Number(win.getMediaSourceId().split(":")[1]),
          win.getBounds(),
          file,
        );
        return { bounds: win.getBounds(), content: win.getContentBounds() };
      },
      { file, capture: path.resolve("tests/mac-window-capture.cjs") },
    );
    const image = sharp(file).resize(bounds.width, bounds.height);
    const marker = await sharp(
      await image
        .clone()
        .extract({
          left: content.x - bounds.x + 25,
          top: content.y - bounds.y + 255,
          width: 10,
          height: 10,
        })
        .toBuffer(),
    ).stats();
    const rgb = marker.channels.slice(0, 3).map((c) => c.mean);
    assert.ok(
      rgb[0] > 245 && rgb[1] < 10 && rgb[2] > 245,
      `Opaque foreground marker missing; unlock test host: ${rgb}`,
    );
    const stats = await sharp(
      await image
        .clone()
        .extract({ left: 350, top: 350, width: 240, height: 120 })
        .toBuffer(),
    ).stats();
    const contrast = stats.channels[0].stdev;
    results.push({ label, strength, contrast, foreground: rgb });
    await fs.writeFile(
      path.join(root, "results.json"),
      JSON.stringify(results, null, 2),
    );
    console.log(label, contrast);
    return contrast;
  }
  const levels = [];
  for (const strength of [0, 10, 30, 60, 100])
    levels.push(await sample(strength));
  assert.ok(levels[0] > 90, "Clear setting must show sharp stripes");
  assert.ok(
    levels[0] - levels[1] > 3 &&
      levels[1] - levels[2] > 3 &&
      levels[2] - levels[3] > 3,
    "Intermediate strengths must produce distinct increasing blur",
  );
  assert.ok(
    levels[4] < levels[0] * 0.2,
    "Maximum blur must strongly soften background detail",
  );
  await app.evaluate(() => globalThis.blurTest.win.setSize(760, 560));
  assert.ok((await sample(30, "resized")) < levels[0] * 0.8);
  await app.evaluate(() => {
    globalThis.blurTest.win.minimize();
    globalThis.blurTest.win.restore();
    globalThis.blurTest.win.moveTop();
  });
  assert.ok((await sample(30, "restored")) < levels[0] * 0.8);
  await page.evaluate(() => window.deft.settings({ material: "solid" }));
  assert.ok(
    (await sample(60, "solid")) < 1,
    "Solid mode must isolate the backdrop",
  );
  console.log(
    "PASS: independent continuous Mac blur, opaque foreground, resize, minimize/restore and solid isolation",
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0));
}
