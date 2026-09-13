// Real packaged renderer at 2x device scale, not an enlarged bitmap or mockup.
// Native OS caption buttons and desktop blur are outside renderer screenshots.
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
await fs.mkdir(".scratch", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".scratch/product-capture-"));
const files = ["Field notes.txt", "A quieter workspace.md"].map((name) =>
  path.join(root, name),
);
await fs.writeFile(
  files[0],
  "A few things worth remembering.\n\nKeep the useful details. Leave room for the unexpected.\n",
);
await fs.writeFile(
  files[1],
  "# A quieter workspace\n\nA place to think, write and make something worth keeping. One document, a few good ideas, and room to follow them.\n\n## This week\n\n- [x] Gather the notes\n- [x] Find the thread that connects them\n- [ ] Turn the first draft into something clear\n\n## Make room for the work\n\n| Focus | Approach |\n| --- | --- |\n| Writing | Begin with one honest sentence |\n| Editing | Keep what helps the reader |\n| Finishing | Leave the next step clear |\n\nGood tools leave room for your own voice.\n",
);
await fs.mkdir(path.join(root, "profile"));
await fs.writeFile(
  path.join(root, "profile", "settings.json"),
  JSON.stringify({
    appearance: "dark",
    material: "solid",
    fontSize: 19,
    reducedMotion: true,
  }),
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
assert.ok(env.DEFT_EXECUTABLE, "Capture must use a packaged executable");
const app = await electron.launch({
  executablePath: env.DEFT_EXECUTABLE,
  args: [
    `--user-data-dir=${path.join(root, "profile")}`,
    "--deft-capture",
    "--force-device-scale-factor=2",
    ...files,
  ],
  env,
});
try {
  const page = await app.firstWindow();
  await page.locator(".cm-content").waitFor();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1920, 1080),
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send("action", "mode-read"),
  );
  await page
    .getByRole("heading", { name: "A quieter workspace", exact: true })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  const capture = async (name) => {
    const file = path.join("docs", name);
    for (let attempt = 0; attempt < 4; attempt++) {
      const png = await app.evaluate(async ({ BrowserWindow }) => {
        const image =
          await BrowserWindow.getAllWindows()[0].webContents.capturePage(
            undefined,
            { stayHidden: true, stayAwake: true },
          );
        return image.toPNG().toString("base64");
      });
      const bytes = Buffer.from(png, "base64");
      const { width, height } = await sharp(bytes).metadata();
      if (width !== 3840 || height !== 2160) {
        // Correct native high-DPI inset rounding by resizing the render surface.
        // Never resample a screenshot to claim a higher resolution.
        await app.evaluate(
          ({ BrowserWindow }, { width, height }) => {
            const win = BrowserWindow.getAllWindows()[0],
              [w, h] = win.getSize();
            win.setSize(
              w + Math.round((3840 - width) / 2),
              h + Math.round((2160 - height) / 2),
            );
          },
          { width, height },
        );
        continue;
      }
      await fs.writeFile(file, bytes);
      console.log(
        `PASS native-rendered 4K image: ${file} (${width} x ${height})`,
      );
      return;
    }
    throw Error("Native capture did not reach exact 3840 x 2160 dimensions");
  };
  await capture("deft-windows.png");
  await page
    .getByRole("button", { name: "Application menu", exact: true })
    .evaluate((button) => button.click());
  await capture("deft-menu-4k.png");
  await page
    .getByRole("menuitem", { name: "Preferences…", exact: true })
    .evaluate((button) => button.click());
  await page
    .getByRole("checkbox", { name: "Translucent title bar", exact: true })
    .waitFor();
  await capture("deft-preferences-4k.png");
} finally {
  await app.evaluate(({ app }) => app.exit(0));
  await app.close();
}
