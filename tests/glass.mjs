import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
import { menuCommand } from "./menu-helpers.mjs";
const root = await fs.mkdtemp(path.resolve(".scratch/glass-"));
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
  page.setDefaultTimeout(10000);
  await page.locator(".cm-content").waitFor();
  await app.evaluate(async ({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows()[0];
    globalThis.testMain = main;
    const background = new BrowserWindow({
      title: "DEFT synthetic backdrop",
      ...main.getBounds(),
      frame: false,
      show: false,
      webPreferences: { sandbox: true, javascript: false },
    });
    globalThis.testBackground = background;
    await background.loadURL(
      'data:text/html,<body style="margin:0;background:white"></body>',
    );
    background.show();
    main.focus();
  });
  for (const appearance of ["light", "dark"])
    for (const material of ["glass", "solid"]) {
      await menuCommand(app, page, "View", "Preferences…");
      await page
        .getByLabel("Appearance", { exact: true })
        .selectOption(appearance);
      await page.getByLabel("Material", { exact: true }).selectOption(material);
      await page.getByRole("button", { name: "Close settings" }).click();
      const samples = [];
      for (const color of ["ffffff", "101010"]) {
        await app.evaluate(async (_, color) => {
          await globalThis.testBackground.loadURL(
            `data:text/html,<body style="margin:0;background:%23${color}"></body>`,
          );
          globalThis.testBackground.show();
          globalThis.testMain.focus();
        }, color);
        await page.waitForTimeout(450);
        const png = await app.evaluate(async ({ desktopCapturer, screen }) => {
          const bounds = globalThis.testMain.getBounds();
          const display = screen.getDisplayMatching(bounds);
          const sources = await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: {
              width: display.size.width * display.scaleFactor,
              height: display.size.height * display.scaleFactor,
            },
          });
          const image = sources.find(
            (source) => source.display_id === String(display.id),
          ).thumbnail;
          const ratio = image.getSize().width / display.size.width;
          return image
            .crop({
              x: Math.round((bounds.x - display.bounds.x + 10) * ratio),
              y: Math.round((bounds.y - display.bounds.y + 45) * ratio),
              width: Math.round((bounds.width - 20) * ratio),
              height: Math.round((bounds.height - 55) * ratio),
            })
            .toPNG()
            .toString("base64");
        });
        const bytes = Buffer.from(png, "base64");
        await fs.writeFile(
          `test-results/glass-${appearance}-${material}-${color}.png`,
          bytes,
        );
        const pixel = await sharp(bytes)
          .extract({ left: 550, top: 400, width: 20, height: 20 })
          .removeAlpha()
          .stats();
        samples.push(pixel.channels.map((channel) => channel.mean));
      }
      console.log(appearance, material, JSON.stringify(samples));
      const difference = Math.max(
        ...samples[0]
          .slice(0, 3)
          .map((value, i) => Math.abs(value - samples[1][i])),
      );
      assert.ok(
        material === "glass" ? difference > 1 : difference < 1,
        `${appearance} ${material} backdrop response: ${difference}`,
      );
    }
} finally {
  await app.evaluate(({ app }) => app.exit(0));
  await app.close();
}
