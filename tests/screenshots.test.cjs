const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
test("GitHub showcase uses native-size desktop captures with honest settings labels", () => {
  const readme = fs.readFileSync(path.join(__dirname, "../README.md"), "utf8");
  for (const name of [
    "deft-windows.png",
    "deft-clear.png",
    "deft-frosted.png",
    "deft-custom-theme.png",
    "deft-fonts.png",
  ]) {
    const bytes = fs.readFileSync(path.join(__dirname, "../docs", name));
    assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
    assert.equal(bytes.readUInt32BE(16), 1040);
    assert.equal(bytes.readUInt32BE(20), 820);
    assert.ok(readme.includes(`docs/${name}`));
  }
  assert.ok(readme.includes("8% background opacity and 14% blur"));
  assert.ok(readme.includes("0% opacity, 0% blur"));
  assert.ok(readme.includes("75% opacity, 90% blur"));
  assert.ok(readme.includes("Georgia, 88% opacity and 70% blur"));
  assert.ok(readme.includes("font families depend on your computer"));
  assert.ok(!readme.includes("More 4K screenshots"));
});
