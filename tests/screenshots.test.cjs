const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
test("GitHub product screenshots are exact 3840 x 2160 PNGs", () => {
  const readme = fs.readFileSync(path.join(__dirname, "../README.md"), "utf8");
  for (const name of [
    "deft-windows.png",
    "deft-menu-4k.png",
    "deft-preferences-4k.png",
  ]) {
    const bytes = fs.readFileSync(path.join(__dirname, "../docs", name));
    assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
    assert.equal(bytes.readUInt32BE(16), 3840);
    assert.equal(bytes.readUInt32BE(20), 2160);
    assert.ok(readme.includes(`docs/${name}`));
  }
});
