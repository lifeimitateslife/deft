import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { placeTestWindow } from "./window-placement.mjs";
await fs.mkdir(".scratch", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".scratch/tab-motion-"));
const files = [];
for (let i = 0; i < 12; i++) {
  const file = path.join(
    root,
    `${i}-${i % 2 ? "longer document name" : "short"}.txt`,
  );
  await fs.writeFile(file, `Document ${i}`);
  files.push(file);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DEFT_EXECUTABLE;
const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [
    ...(executablePath ? [] : ["."]),
    `--user-data-dir=${path.join(root, "profile")}`,
    ...files,
  ],
  env,
});
try {
  const page = await app.firstWindow();
  await placeTestWindow(app);
  await page.waitForFunction(
    () => document.querySelectorAll(".tab").length === 12,
  );
  const order = () =>
    page
      .locator(".tab")
      .evaluateAll((tabs) => tabs.map((tab) => tab.dataset.id));
  const original = await order();
  async function start() {
    await page.locator(".tabs").evaluate((el) => {
      el.scrollLeft = 0;
    });
    await page.waitForTimeout(220);
    const box = await page.locator(".tab").first().boundingBox();
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 230, box.y + box.height / 2, { steps: 10 });
    await page.waitForTimeout(60);
    await page.locator(".tab.dragging").waitFor();
    assert.deepEqual(await order(), original, "Preview must not commit order");
  }
  await start();
  await page
    .locator(".tab.dragging > button")
    .first()
    .evaluate((button) => {
      for (const type of [
        "pointerdown",
        "pointerup",
        "pointercancel",
        "lostpointercapture",
      ])
        button.dispatchEvent(
          new PointerEvent(type, { pointerId: 99, button: 0, bubbles: true }),
        );
    });
  assert.equal(
    await page.locator(".tab.dragging").count(),
    1,
    "A secondary pointer cannot end the owned drag",
  );
  const preview = await page.locator(".tab").evaluateAll((tabs) =>
    tabs.map((el) => ({
      transform: getComputedStyle(el).transform,
      transition: getComputedStyle(el).transitionDuration,
    })),
  );
  assert.notEqual(preview[0].transform, "none");
  assert.equal(preview[1].transition, "0.18s");
  await page.screenshot({ path: path.join(root, "drag-preview.png") });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.waitForTimeout(220);
  assert.deepEqual(await order(), original, "Escape rolls back");
  for (const system of [true, false]) {
    if (system) await page.emulateMedia({ reducedMotion: "reduce" });
    else {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.evaluate(() =>
        document
          .querySelector("main")
          .setAttribute("data-reduced-motion", "true"),
      );
    }
    await start();
    assert.equal(
      await page
        .locator(".tab")
        .nth(1)
        .evaluate((el) => getComputedStyle(el).transitionDuration),
      "0s",
    );
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(
      await page
        .locator(".tab")
        .evaluateAll((tabs) => tabs.flatMap((el) => el.getAnimations()).length),
      0,
    );
  }
  await page.evaluate(() =>
    document.querySelector("main").setAttribute("data-reduced-motion", "false"),
  );
  await start();
  const nav = await page.locator(".tabs").boundingBox();
  await page.mouse.move(nav.x + nav.width - 5, nav.y + nav.height / 2);
  await page.waitForFunction(
    () => document.querySelector(".tabs").scrollLeft > 180,
  );
  await page.mouse.up();
  await page.waitForTimeout(220);
  assert.notDeepEqual(
    await order(),
    original,
    "Edge scroll allows overflow reordering",
  );
  assert.equal(await page.locator(".tab").count(), 12);
  console.log(
    `PASS variable-width sliding preview, cancellation, app/system reduced motion and overflow auto-scroll: ${root}`,
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await app.close();
}
