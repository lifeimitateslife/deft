import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { placeTestWindow } from "./window-placement.mjs";
await fs.mkdir(".scratch", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".scratch/clipboard-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DEFT_EXECUTABLE;
for (const extension of ["txt", "md"]) {
  const file = path.join(root, `paste.${extension}`);
  await fs.writeFile(file, "");
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
    await placeTestWindow(app);
    const editor = page.locator(".cm-content");
    await editor.waitFor();
    await editor.click();
    await editor.evaluate((element) => {
      const data = new DataTransfer();
      data.setData("text/plain", "Plain flavor");
      data.setData("text/html", "<p>Distinct <strong>HTML flavor</strong></p>");
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    assert.equal(await editor.textContent(), "Plain flavor");
    console.log(
      `${extension}: distinct HTML/plain paste preserves the plain flavor`,
    );
    if (process.env.DEFT_FORMATTED_PASTE === "1") {
      const mod = process.platform === "darwin" ? "Meta" : "Control";
      await page.keyboard.press(`${mod}+a`);
      await page.keyboard.press(`${mod}+b`);
      await page.keyboard.press(`${mod}+a`);
      await editor.evaluate((element) => {
        const data = new DataTransfer();
        data.setData("text/plain", "**Portable** source");
        data.setData("text/html", "<p>Different <em>HTML</em></p>");
        element.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: data,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      assert.equal(await editor.textContent(), "**Portable** source");
      console.log(
        `${extension}: paste policy stays unchanged after explicit formatting`,
      );
    }
  } finally {
    await app.close();
  }
}
