const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { createHash } = require("node:crypto");
const sharp = require("sharp");
test("all icon exports preserve the exact approved source artwork", async () => {
  const source = await fs.readFile("assets/icon-source.png");
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    "67f8e6d53e924edc975ec8eb386ccb7eb622ffd5f88c958ffa0b482c256cf41f",
  );
  for (const size of [16, 20, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    const expected = await sharp(source)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .raw()
      .toBuffer();
    for (const name of ["icon", "document"]) {
      const actual = await sharp(`assets/icon-sizes/${name}-${size}.png`)
        .raw()
        .toBuffer();
      assert.deepEqual(actual, expected);
    }
  }
  const ico = await fs.readFile("assets/icon.ico");
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 8);
  const icns = await fs.readFile("assets/icon.icns");
  assert.equal(icns.toString("ascii", 0, 4), "icns");
  assert.equal(icns.readUInt32BE(4), icns.length);
  for (let offset = 8; offset < icns.length;) {
    const size = icns.readUInt32BE(offset + 4);
    const image = icns.subarray(offset + 8, offset + size);
    const metadata = await sharp(image).metadata();
    assert.deepEqual(
      image,
      await fs.readFile(`assets/icon-sizes/icon-${metadata.width}.png`),
    );
    offset += size;
  }
});
