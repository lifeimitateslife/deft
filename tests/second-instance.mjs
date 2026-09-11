import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

await fs.mkdir(".scratch", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".scratch/handoff-test-"));
const packaged = process.env.DEFT_EXECUTABLE;
const exe = packaged || (await import("electron")).default;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const args = [
  ...(packaged ? [] : ["."]),
  `--user-data-dir=${path.join(root, "profile")}`,
];
const children = new Set();
const app = await electron.launch({ executablePath: exe, args, env });
const rounds = Number(process.env.DEFT_HANDOFF_ROUNDS || 12);
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(5000);
  await page.getByRole("button", { name: "New text", exact: true }).waitFor();
  await app.evaluate(({ app, dialog, BrowserWindow }) => {
    let handling = false;
    globalThis.handoff = {
      received: 0,
      focus: 0,
      synchronousFocus: 0,
      dialogs: 0,
      opened: 0,
      writes: 0,
      maxWrites: 0,
    };
    app.prependListener("second-instance", () => {
      handling = true;
      globalThis.handoff.received++;
    });
    app.on("second-instance", () => {
      handling = false;
    });
    const win = BrowserWindow.getAllWindows()[0],
      focus = win.focus;
    win.focus = function (...args) {
      globalThis.handoff.focus++;
      if (handling) globalThis.handoff.synchronousFocus++;
      return focus.apply(this, args);
    };
    for (const name of ["showOpenDialog", "showMessageBox"]) {
      const original = dialog[name];
      dialog[name] = (...args) => {
        globalThis.handoff.dialogs++;
        return original(...args);
      };
    }
    const { DocumentStore } = process
      .getBuiltinModule("module")
      .createRequire(app.getAppPath() + "/package.json")(
      "./desktop/storage.cjs",
    );
    const open = DocumentStore.prototype.open;
    DocumentStore.prototype.open = async function (...args) {
      const doc = await open.apply(this, args);
      globalThis.handoff.opened++;
      return doc;
    };
    const filesystem = process.getBuiltinModule("fs/promises"),
      rename = filesystem.rename;
    filesystem.rename = async (...args) => {
      if (!String(args[1]).endsWith("settings.json")) return rename(...args);
      globalThis.handoff.writes++;
      globalThis.handoff.maxWrites = Math.max(
        globalThis.handoff.maxWrites,
        globalThis.handoff.writes,
      );
      try {
        // Enlarge the real settings-write overlap, without replacing the filesystem operation.
        await new Promise((resolve) => setTimeout(resolve, 25));
        return await rename(...args);
      } finally {
        globalThis.handoff.writes--;
      }
    };
  });
  async function invoke(files) {
    await new Promise((resolve, reject) => {
      const child = spawn(exe, [...args, ...files], {
        env,
        stdio: ["ignore", "ignore", "pipe"],
      });
      children.add(child);
      let stderr = "";
      child.stderr.on("data", (chunk) => (stderr += chunk));
      const timer = setTimeout(() => {
        child.kill();
        reject(
          Error(
            "Secondary invocation did not exit within 5 seconds: " + stderr,
          ),
        );
      }, 5000);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        children.delete(child);
        code === 0
          ? resolve()
          : reject(Error(`Secondary exit ${code}: ${stderr}`));
      });
    });
  }
  const files = [];
  for (let n = 0; n < 12; n++) {
    const file = path.join(root, `雪 résumé file ${n}.${n % 2 ? "md" : "txt"}`);
    await fs.writeFile(file, `Document ${n}\r\n`);
    files.push(file);
  }
  for (let round = 0; round < rounds; round++) {
    const group = files.slice((round % 4) * 3, (round % 4) * 3 + 3);
    await Promise.all(group.map((file) => invoke([file])));
    for (const file of group)
      await page
        .getByRole("button", { name: path.basename(file), exact: false })
        .first()
        .waitFor();
    assert.equal(
      await app.evaluate(() => globalThis.handoff.synchronousFocus),
      0,
    );
    assert.equal(
      await app.evaluate(() => globalThis.handoff.dialogs),
      0,
      "File delivery must never open a picker",
    );
    assert.equal(
      await page.locator(".notice").count(),
      0,
      "Open must not surface a settings-write error",
    );
  }
  await invoke(files.slice(0, 3)); // One invocation containing several paths.
  await page.evaluate(() =>
    Promise.all([
      window.deft.settings({ wrap: false }),
      window.deft.settings({ wrap: true }),
    ]),
  );
  assert.equal(
    await app.evaluate(() => globalThis.handoff.maxWrites),
    1,
    "Settings replacements must not overlap",
  );
  assert.equal(await page.locator(".tab").count(), 12);
  for (const file of files.slice(0, 2)) {
    await page
      .getByRole("button", { name: path.basename(file), exact: false })
      .first()
      .click();
    if (file.endsWith(".md"))
      await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.locator(".cm-content").click();
    await page.keyboard.press(
      `${process.platform === "darwin" ? "Meta" : "Control"}+End`,
    );
    await page.keyboard.type("Saved edit");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await fs.readFile(file, "utf8")).endsWith("Saved edit")) break;
      await page.waitForTimeout(50);
    }
    assert.ok((await fs.readFile(file, "utf8")).endsWith("Saved edit"));
    await page.keyboard.press(
      `${process.platform === "darwin" ? "Meta" : "Control"}+w`,
    );
    await invoke([file]);
    await page
      .getByRole("button", { name: path.basename(file), exact: false })
      .first()
      .waitFor();
    assert.ok(
      (await page.locator(".cm-content").textContent()).includes("Saved edit"),
    );
  }
  const stats = await app.evaluate(() => globalThis.handoff);
  assert.equal(stats.received, rounds * 3 + 3);
  assert.equal(stats.opened, rounds * 3 + 5);
  assert.ok(stats.focus > 0, "Window activation remains enabled");
  console.log(
    `PASS ${rounds * 3 + 3} handoffs: concurrent, successive, multiple paths, Unicode/spaces, duplicate focus, txt/md save-close-reopen; serialized real settings writes.`,
  );
} catch (error) {
  console.error(
    "Visible error:",
    await (await app.firstWindow()).locator(".notice").allTextContents(),
  );
  throw error;
} finally {
  for (const child of children) child.kill();
  await app.evaluate(({ app }) => app.exit(0));
  await app.close();
}
