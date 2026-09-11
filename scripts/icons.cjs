const fs = require("node:fs/promises");
const sharp = require("sharp");
async function render(name) {
  await fs.mkdir("assets", { recursive: true });
  const svg = await fs.readFile(`assets/${name}.svg`);
  await sharp(Buffer.from(svg)).resize(1024).png().toFile(`assets/${name}.png`);
  const sizes = [16, 32, 48, 64, 128, 256];
  const buffers = await Promise.all(
    sizes.map((size) => sharp(Buffer.from(svg)).resize(size).png().toBuffer()),
  );
  const { default: pngToIco } = await import("png-to-ico");
  await fs.writeFile(`assets/${name}.ico`, await pngToIco(buffers));
  const chunks = [];
  for (const [type, size] of [
    ["icp4", 16],
    ["icp5", 32],
    ["icp6", 64],
    ["ic07", 128],
    ["ic08", 256],
    ["ic09", 512],
    ["ic10", 1024],
  ]) {
    const png = await sharp(Buffer.from(svg)).resize(size).png().toBuffer();
    const h = Buffer.alloc(8);
    h.write(type);
    h.writeUInt32BE(png.length + 8, 4);
    chunks.push(h, png);
  }
  const header = Buffer.alloc(8);
  header.write("icns");
  header.writeUInt32BE(8 + chunks.reduce((sum, b) => sum + b.length, 0), 4);
  await fs.writeFile(`assets/${name}.icns`, Buffer.concat([header, ...chunks]));
}
Promise.all([render("icon"), render("document")]).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
