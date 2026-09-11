import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const profile = path.join(process.env.APPDATA, "deft");
const running = await exec("powershell", [
  "-NoProfile",
  "-Command",
  "@(Get-Process -Name DEFT -ErrorAction SilentlyContinue).Count",
]);
assert.equal(
  Number(running.stdout.trim()),
  0,
  "Close DEFT before shell acceptance; never commandeer an existing instance",
);
// Refuse an existing document session; preserve an empty profile's exact preferences.
async function snapshot(file) {
  try {
    return await fs.readFile(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
const recovery = path.join(profile, "recovery", "session.json");
const settingsPath = path.join(profile, "settings.json");
const recoveryBefore = await snapshot(recovery),
  settingsBefore = await snapshot(settingsPath);
assert.equal(
  JSON.parse(recoveryBefore?.toString() || "[]").length,
  0,
  "Preserve existing document sessions; use isolated tests",
);
assert.equal(
  (JSON.parse(settingsBefore?.toString() || "{}").recent || []).length,
  0,
  "Preserve existing recent documents; use isolated tests",
);
let app;
try {
  const root = await fs.mkdtemp(path.resolve(".scratch/shell-acceptance-"));
  const files = [];
  for (let n = 0; n < 8; n++) {
    const f = path.join(root, `雪 shell document ${n}.${n % 2 ? "md" : "txt"}`);
    await fs.writeFile(f, `Shell document ${n}\r\n`);
    files.push(f);
  }
  const { stdout } = await exec("python", [
    "tests/windows-shell-open.py",
    files[0],
  ]);
  const coldPid = Number(stdout.trim());
  assert.ok(coldPid > 0);
  try {
    let opened = false;
    for (let n = 0; n < 100; n++) {
      try {
        opened = JSON.parse(await fs.readFile(recovery, "utf8")).some(
          (d) => d.path === files[0] && d.text === "Shell document 0\r\n",
        );
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (opened) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(
      opened,
      "Normal cold shell launch must open the txt file and retain exact source",
    );
  } finally {
    process.kill(coldPid);
    let exited = false;
    for (let n = 0; n < 100; n++) {
      try {
        process.kill(coldPid, 0);
      } catch (error) {
        if (error.code === "ESRCH") {
          exited = true;
          break;
        }
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(
      exited,
      "Cold launch must exit before reopening the same profile",
    );
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: path.join(
      process.env.LOCALAPPDATA,
      "Programs",
      "DEFT",
      "DEFT.exe",
    ),
    env,
    args: [],
  });
  {
    const page = await app.firstWindow();
    page.setDefaultTimeout(5000);
    await page
      .getByRole("button", { name: path.basename(files[0]), exact: false })
      .first()
      .waitFor();
    for (const file of files.slice(1)) {
      await exec("python", ["tests/windows-shell-open.py", "--wait", file]);
      await page
        .getByRole("button", { name: path.basename(file), exact: false })
        .first()
        .waitFor();
    }
    assert.equal(await page.locator(".tab").count(), 8);
    for (const file of files.slice(0, 2)) {
      await page
        .getByRole("button", { name: path.basename(file), exact: false })
        .first()
        .click();
      if (file.endsWith(".md"))
        await page.getByRole("button", { name: "Source", exact: true }).click();
      await page.locator(".cm-content").click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type("Saved through shell test");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page
        .locator("footer > span")
        .first()
        .filter({ hasText: /^Saved$/ })
        .waitFor();
      assert.ok(
        (await fs.readFile(file, "utf8")).endsWith("Saved through shell test"),
      );
      await page.keyboard.press("Control+w");
      await exec("python", ["tests/windows-shell-open.py", "--wait", file]);
      await page
        .getByRole("button", { name: path.basename(file), exact: false })
        .first()
        .waitFor();
      assert.ok(
        (await page.locator(".cm-content").textContent()).includes(
          "Saved through shell test",
        ),
      );
    }
    for (let n = 0; n < 8; n++) {
      await page.keyboard.press("Control+w");
      await page.waitForFunction(
        (count) => document.querySelectorAll(".tab").length === count,
        7 - n,
      );
    }
    await page.evaluate(() => window.deft.settings({ recent: [] }));
    console.log(
      "PASS installed Windows shell association: normal cold txt launch, existing-instance md/txt, 7 successive files, Unicode/spaces, save-close-shell-reopen; defaults unchanged.",
    );
  }
} finally {
  if (app) {
    await app.evaluate(({ app }) => app.exit(0));
    await app.close();
  }
  // The preflight proved no owner documents; restore preferences after the process has exited.
  await fs.mkdir(path.dirname(recovery), { recursive: true });
  await fs.writeFile(recovery, recoveryBefore || "[]");
  await fs.writeFile(settingsPath, settingsBefore || "{}");
}
