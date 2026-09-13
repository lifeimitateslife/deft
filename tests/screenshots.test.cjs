const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("GitHub opens with a full-width panoramic DEFT banner", () => {
  const readme = fs.readFileSync(path.join(__dirname, "../README.md"), "utf8");
  assert.ok(readme.startsWith('<p align="center">'));
  assert.ok(readme.includes('<a href="docs/deft-banner.png"><img src="docs/deft-banner.png" width="100%" alt="DEFT - Life Imitates Life"></a>'));
  const bytes = fs.readFileSync(path.join(__dirname, "../docs/deft-banner.png"));
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  assert.equal(bytes.readUInt32BE(16), 2172);
  assert.equal(bytes.readUInt32BE(20), 724);
});
test("GitHub showcase uses native-size desktop captures with honest settings labels", () => {
  const readme = fs.readFileSync(path.join(__dirname, "../README.md"), "utf8");
  for (const name of [
    "deft-windows.png",
    "deft-clear-contrast.png",
    "deft-frosted.png",
    "deft-custom-theme.png",
    "deft-fonts.png",
  ]) {
    const bytes = fs.readFileSync(path.join(__dirname, "../docs", name));
    assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
    assert.equal(bytes.readUInt32BE(16), 1040);
    assert.equal(bytes.readUInt32BE(20), 820);
    assert.ok(readme.includes(`docs/${name}`));
    const imageLine = readme.split(/\r?\n/).find((line) => line.includes(`](docs/${name})`));
    assert.ok(imageLine && !imageLine.trimStart().startsWith("|"), "Showcase images must not shrink into table cells");
  }
  assert.ok(readme.includes("8% background opacity and 14% blur"));
  assert.ok(readme.includes("60% opacity, 0% blur"));
  assert.ok(readme.includes("75% opacity, 90% blur"));
  assert.ok(readme.includes("Georgia, 88% opacity and 70% blur"));
  assert.ok(readme.includes("font families depend on your computer"));
  assert.ok(!readme.includes("More 4K screenshots"));
});

test("Showcase keeps full-size examples in sections open by default", () => {
  const readme = fs.readFileSync(path.join(__dirname, "../README.md"), "utf8");
  const sections = [...readme.matchAll(/<details open>\s*<summary>(.*?)<\/summary>\s*([\s\S]*?)<\/details>/g)];
  assert.equal(sections.length, 3);
  for (const section of sections) assert.ok(section[1].includes("Click to collapse / expand"));
  assert.equal((readme.match(/<details\b/g) || []).length, 3);
  assert.ok(readme.indexOf("docs/deft-windows.png") < readme.indexOf("<details open>"));
  for (const [index, names] of [
    ["deft-clear-contrast.png", "deft-frosted.png"],
    ["deft-custom-theme.png"],
    ["deft-fonts.png"],
  ].entries()) {
    for (const name of names) assert.ok(sections[index][2].includes(`](docs/${name})`));
  }
});
