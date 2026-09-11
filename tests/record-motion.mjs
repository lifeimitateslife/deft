import { placeTestWindow } from "./window-placement.mjs";
import { menuCommand, openFormat } from "./menu-helpers.mjs";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
const root = await fs.mkdtemp(path.resolve(".scratch/motion-native-"));
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
  await placeTestWindow(app);
  page.setDefaultTimeout(10000);
  await page.locator(".cm-content").waitFor();
  await page
    .locator(".cm-content")
    .fill(
      "A little room to think.\n\nUnfinished words stay here when you close DEFT.",
    );
  const source = await app.evaluate(
    async ({ desktopCapturer, BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.show();
      win.focus();
      const sources = await desktopCapturer.getSources({
        types: ["window"],
        thumbnailSize: { width: 1120, height: 800 },
      });
      const source = sources.find((s) => s.name === "DEFT");
      if (!source) throw Error("DEFT capture target not found");
      win.webContents.session.setPermissionCheckHandler((_wc, p) =>
        ["display-capture", "media"].includes(p),
      );
      win.webContents.session.setPermissionRequestHandler((_wc, p, cb) =>
        cb(["display-capture", "media"].includes(p)),
      );
      return {
        id: source.id,
        thumbnail: source.thumbnail.toPNG().toString("base64"),
      };
    },
  );
  await fs.writeFile(
    "test-results/native-frame.png",
    Buffer.from(source.thumbnail, "base64"),
  );
  await page.evaluate(async (id) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: id,
          maxFrameRate: 30,
        },
      },
    });
    window.captureChunks = [];
    window.captureStream = stream;
    window.captureRecorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
    });
    window.captureRecorder.ondataavailable = (e) => {
      if (e.data.size) window.captureChunks.push(e.data);
    };
    window.captureRecorder.start();
  }, source.id);
  for (const appearance of ["dark", "light"]) {
    await menuCommand(app, page, "View", "Preferences…");
    await page
      .getByRole("combobox", { name: "Appearance", exact: true })
      .selectOption(appearance);
    await page.waitForTimeout(500);
    await page
      .getByRole("button", { name: "Close Preferences", exact: true })
      .click();
    await page.waitForTimeout(500);
  }
  await menuCommand(app, page, "File", "New Markdown");
  await page
    .locator(".tab.active")
    .filter({ hasText: "Untitled.md" })
    .waitFor();
  for (let i = 0; i < 3; i++) {
    await openFormat(app, page);
    await page.waitForTimeout(350);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
  }
  const bytes = await page.evaluate(async () => {
    const recorder = window.captureRecorder;
    await new Promise((resolve) => {
      recorder.onstop = resolve;
      recorder.stop();
    });
    window.captureStream.getTracks().forEach((track) => track.stop());
    return Array.from(
      new Uint8Array(
        await new Blob(window.captureChunks, {
          type: "video/webm",
        }).arrayBuffer(),
      ),
    );
  });
  await fs.writeFile("test-results/native-motion.webm", Buffer.from(bytes));
  console.log(
    "PASS native DEFT window capture recorded",
    bytes.length,
    "bytes",
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0));
  await app.close();
}
