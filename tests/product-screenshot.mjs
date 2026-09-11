import { placeTestWindow } from "./window-placement.mjs";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { menuCommand } from "./menu-helpers.mjs";
const root = await fs.mkdtemp(path.resolve(".scratch/product-capture-"));
const file = path.join(root, "A quieter workspace.md");
await fs.writeFile(
  file,
  "# A quieter workspace\n\nA place to think, write and make something worth keeping. One document, a few good ideas, and room to follow them.\n\n## This week\n\n- [x] Gather the notes\n- [x] Find the thread that connects them\n- [ ] Turn the first draft into something clear\n\n## Make room for the work\n\n| Focus | Approach |\n| --- | --- |\n| Writing | Begin with one honest sentence |\n| Editing | Keep what helps the reader |\n| Finishing | Leave the next step clear |\n\nGood tools leave room for your own voice.\n",
);
await fs.mkdir(path.join(root, "profile"));
await fs.writeFile(
  path.join(root, "profile", "settings.json"),
  JSON.stringify({ appearance: "dark", material: "solid", fontSize: 17 }),
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
assert.ok(
  process.env.DEFT_EXECUTABLE,
  "Capture must use a packaged executable",
);
const app = await electron.launch({
  executablePath: process.env.DEFT_EXECUTABLE,
  args: [`--user-data-dir=${path.join(root, "profile")}`, file],
  env,
});
try {
  const page = await app.firstWindow();
  await placeTestWindow(app);
  await page.locator(".cm-content").waitFor();
  if (process.env.DEFT_TEST_SECONDARY !== "1")
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1180, 820),
    );
  await placeTestWindow(app);
  await menuCommand(app, page, "View", "Read");
  await page
    .getByRole("heading", { name: "A quieter workspace", exact: true })
    .waitFor();
  await page.waitForTimeout(250);
  await page.screenshot({ path: "docs/deft-windows.png" });
  console.log(
    "PASS real packaged application screenshot, synthetic writing, Dark/Solid Read view",
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0));
  await app.close();
}
