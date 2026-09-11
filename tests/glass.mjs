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
  await app.evaluate(async ({ BrowserWindow, screen }) => {
    const main = BrowserWindow.getAllWindows()[0];
    const secondary = screen
      .getAllDisplays()
      .find((display) => display.id !== screen.getPrimaryDisplay().id);
    if (process.env.DEFT_TEST_SECONDARY === "1") {
      if (!secondary) throw Error("Requested second monitor is unavailable");
      main.setBounds({
        x: secondary.workArea.x + 40,
        y: secondary.workArea.y + 80,
        width: Math.min(960, secondary.workArea.width - 80),
        height: 800,
      });
    }
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
    main.setParentWindow(background);
    background.showInactive();
    main.show();
    main.moveTop();
    main.focus();
  });
  await page.evaluate(() => {
    const marker = document.createElement("div");
    marker.style.cssText =
      "position:fixed;left:20px;top:80px;width:12px;height:12px;background:rgb(17,203,91);z-index:100;pointer-events:none";
    document.querySelector("main").append(marker);
  });
  const responses = {};
  for (const appearance of ["light", "dark"])
    for (const material of ["glass", "solid"])
      for (const opacity of material === "glass" ? [0, 68, 95] : [68]) {
        await menuCommand(app, page, "View", "Preferences…");
        await page
          .getByLabel("Appearance", { exact: true })
          .selectOption(appearance);
        await page
          .getByLabel("Material", { exact: true })
          .selectOption(material);
        if (material === "glass")
          await page
            .getByLabel("Background opacity", { exact: true })
            .fill(String(opacity));
        await page.getByRole("button", { name: "Close Preferences" }).click();
        const samples = [];
        for (const color of ["ffffff", "101010"]) {
          await app.evaluate(async (_, color) => {
            await globalThis.testBackground.loadURL(
              `data:text/html,<body style="margin:0;background:%23${color}"></body>`,
            );
            globalThis.testBackground.showInactive();
            globalThis.testMain.show();
            globalThis.testMain.moveTop();
            globalThis.testMain.focus();
          }, color);
          await page.waitForTimeout(450);
          const capture = await app.evaluate(
            async ({ desktopCapturer, screen }) => {
              if (
                !globalThis.testMain.isVisible() ||
                globalThis.testMain.isMinimized() ||
                !globalThis.testMain.isFocused() ||
                !globalThis.testBackground.isVisible()
              )
                throw Error(
                  "Controlled compositor windows are not visible and focused",
                );
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
              const content = globalThis.testMain.getContentBounds();
              return {
                marker: {
                  left: Math.round((content.x - bounds.x + 24 - 10) * ratio),
                  top: Math.round((content.y - bounds.y + 84 - 45) * ratio),
                  width: 2,
                  height: 2,
                },
                png: image
                  .crop({
                    x: Math.round((bounds.x - display.bounds.x + 10) * ratio),
                    y: Math.round((bounds.y - display.bounds.y + 45) * ratio),
                    width: Math.round((bounds.width - 20) * ratio),
                    height: Math.round((bounds.height - 55) * ratio),
                  })
                  .toPNG()
                  .toString("base64"),
              };
            },
          );
          const bytes = Buffer.from(capture.png, "base64");
          const marker = await sharp(
            await sharp(bytes).extract(capture.marker).toBuffer(),
          ).stats();
          assert.ok(
            [17, 203, 91].every(
              (value, index) =>
                Math.abs(marker.channels[index].mean - value) < 2,
            ),
            "Capture must contain the DEFT test marker, not another desktop/window",
          );
          await fs.writeFile(
            `test-results/glass-${appearance}-${material}-${opacity}-${color}.png`,
            bytes,
          );
          const pixel = await sharp(bytes)
            .extract({ left: 550, top: 400, width: 20, height: 20 })
            .removeAlpha()
            .toBuffer();
          const stats = await sharp(pixel).stats();
          samples.push(stats.channels.map((channel) => channel.mean));
        }
        console.log(appearance, material, opacity, JSON.stringify(samples));
        const difference = Math.max(
          ...samples[0]
            .slice(0, 3)
            .map((value, i) => Math.abs(value - samples[1][i])),
        );
        responses[`${appearance}-${material}-${opacity}`] = difference;
        assert.ok(
          material === "glass" ? difference > 0.1 : difference < 1,
          `${appearance} ${material} backdrop response: ${difference}`,
        );
      }
  for (const appearance of ["light", "dark"]) {
    assert.ok(
      responses[`${appearance}-glass-0`] >
        responses[`${appearance}-glass-68`] + 5,
    );
    assert.ok(
      responses[`${appearance}-glass-68`] >
        responses[`${appearance}-glass-95`] + 5,
    );
  }
  console.log(
    "PASS: native background response decreases with opacity; Solid remains opaque",
    JSON.stringify(responses),
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0));
  await app.close();
}
