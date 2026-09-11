import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
await fs.mkdir(".scratch", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".scratch/native-"));
const fixture = path.join(root, "雪 note.md");
const original = Buffer.from(
  "\ufeff# DEFT\r\n\r\nA **focused** editor.  \n\n- [ ] A task\n\n## Another section\n\n| One | Two |\n| --- | --- |\n| A | B |\n",
);
await fs.writeFile(fixture, original);
const executablePath = process.env.DEFT_EXECUTABLE;
const mod = process.platform === "darwin" ? "Meta" : "Control";
const started = Date.now();
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [
    ...(executablePath ? [] : ["."]),
    `--user-data-dir=${path.join(root, "profile")}`,
    fixture,
  ],
  env,
});
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .getByRole("button", { name: "雪 note.md", exact: false })
    .first()
    .waitFor();
  await page.locator(".cm-content").waitFor();
  await fs.mkdir("test-results", { recursive: true });
  console.log(`Native startup to editor: ${Date.now() - started} ms`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(350);
  assert.deepEqual(await fs.readFile(fixture), original);
  for (const label of ["Source", "Read", "Live"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(350);
  assert.deepEqual(await fs.readFile(fixture), original);
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type("Targeted edit");
  console.log(
    "Editor has edit:",
    (await editor.textContent()).includes("Targeted edit"),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(
    (await fs.readFile(fixture)).toString(),
    original.toString() + "Targeted edit",
  );
  await editor.click();
  await page.keyboard.press(`${mod}+z`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(400);
  assert.deepEqual(await fs.readFile(fixture), original);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  for (const appearance of ["light", "dark"])
    for (const material of ["glass", "solid"]) {
      await page
        .getByLabel("Appearance", { exact: true })
        .selectOption(appearance);
      await page.getByLabel("Material", { exact: true }).selectOption(material);
      await page.getByRole("button", { name: "Close settings" }).click();
      await page.screenshot({
        path: `test-results/${appearance}-${material}.png`,
      });
      await page.getByRole("button", { name: "Settings", exact: true }).click();
    }
  await page.getByRole("button", { name: "Close settings" }).click();
  assert.deepEqual(errors, []);
  const executable =
    executablePath || (await app.evaluate(() => process.execPath));
  async function openFromProcess(file) {
    await new Promise((resolve, reject) => {
      const child = spawn(
        executable,
        [
          ...(executablePath ? [] : ["."]),
          `--user-data-dir=${path.join(root, "profile")}`,
          file,
        ],
        { env, stdio: ["ignore", "ignore", "pipe"] },
      );
      let error = "";
      child.stderr.on("data", (data) => (error += data));
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(Error(`Secondary process ${code}: ${error}`)),
      );
    });
  }
  await openFromProcess(fixture);
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".tab").count(), 1);
  const unknown = path.join(root, "config.with-any-extension");
  await fs.writeFile(unknown, "Alpha\r\nBeta\n");
  await openFromProcess(unknown);
  await page
    .getByRole("button", { name: "config.with-any-extension", exact: false })
    .first()
    .waitFor();
  assert.equal(await page.locator(".tab").count(), 2);
  await page.getByRole("button", { name: "Editable", exact: true }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type("BLOCKED");
  assert.ok(
    !(await page.locator(".cm-content").textContent()).includes("BLOCKED"),
  );
  await page.getByRole("button", { name: "Read-only", exact: true }).click();
  await page.keyboard.press(`${mod}+f`);
  await page.getByPlaceholder("Find").fill("Alpha");
  await page.getByPlaceholder("Replace").fill("Gamma");
  await page.getByRole("button", { name: "replace all", exact: true }).click();
  assert.ok(
    (await page.locator(".cm-content").textContent()).includes("Gamma"),
    "Replace all changes the editor",
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press(`${mod}+s`);
  for (
    let attempt = 0;
    attempt < 50 && (await fs.readFile(unknown, "utf8")) !== "Gamma\r\nBeta\n";
    attempt++
  )
    await page.waitForTimeout(100);
  assert.equal(await fs.readFile(unknown, "utf8"), "Gamma\r\nBeta\n");
  await fs.writeFile(unknown, "External refresh");
  await page.waitForTimeout(2900);
  assert.ok(
    (await page.locator(".cm-content").textContent()).includes(
      "External refresh",
    ),
  );
  const hostile = path.join(root, "hostile.md");
  await fs.writeFile(
    hostile,
    "# Safe\n\n<script>window.compromised=true</script>\n\n[Bad](javascript:alert(1))\n\n![Remote](https://example.invalid/image.png)\n\n$x^2$\n",
  );
  const network = [];
  page.on("request", (req) => {
    if (/^https?:/.test(req.url())) network.push(req.url());
  });
  await openFromProcess(hostile);
  await page
    .getByRole("button", { name: "hostile.md", exact: false })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.locator("article math").waitFor();
  assert.equal(await page.evaluate(() => window.compromised), undefined);
  assert.equal(await page.locator("article script").count(), 0);
  assert.deepEqual(network, []);
  const large = path.join(root, "large.txt");
  await fs.writeFile(large, "0123456789 abcdef\n".repeat(130000));
  const largeStart = Date.now();
  await openFromProcess(large);
  await page
    .getByRole("button", { name: "large.txt", exact: false })
    .first()
    .waitFor();
  await page.locator(".cm-content").click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type("end");
  console.log(`2.2 MB file open and end edit: ${Date.now() - largeStart} ms`);
  await page
    .getByRole("button", { name: "config.with-any-extension", exact: false })
    .first()
    .click();
  await app.evaluate(({ app }) => {
    const { DocumentStore } = process
      .getBuiltinModule("module")
      .createRequire(app.getAppPath() + "/package.json")(
      "./desktop/storage.cjs",
    );
    const original = DocumentStore.prototype.reload;
    DocumentStore.prototype.reload = async function (id) {
      const candidate = await original.call(this, id);
      globalThis.reloadPending = true;
      await new Promise((resolve) => setTimeout(resolve, 800));
      return candidate;
    };
  });
  await fs.writeFile(unknown, "Another external version");
  for (
    let attempt = 0;
    attempt < 40 && !(await app.evaluate(() => globalThis.reloadPending));
    attempt++
  )
    await page.waitForTimeout(100);
  assert.equal(await app.evaluate(() => globalThis.reloadPending), true);
  await page.locator(".cm-content").click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(" local edit");
  await page.waitForTimeout(950);
  assert.ok(
    (await page.locator(".cm-content").textContent()).includes(
      "External refresh local edit",
    ),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(200);
  assert.equal(await fs.readFile(unknown, "utf8"), "Another external version");
  console.log(
    "PASS typing during delayed external reload preserves local edits and conflict protection",
  );
  console.log(
    "PASS duplicate and second-instance opens, unknown extension, read-only, search/replace, external refresh, hostile Markdown, math, large-file editing",
  );
  console.log(
    "PASS native open/save/edit/undo/mode round trips and four appearance captures",
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0));
  await app.close();
}
