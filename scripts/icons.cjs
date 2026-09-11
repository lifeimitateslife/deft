const fs = require("node:fs/promises");
const sharp = require("sharp");
async function main() {
  const source = await fs.readFile("assets/icon-source.png");
  await fs.mkdir("assets/icon-sizes", { recursive: true });
  const sizes = [16, 20, 24, 32, 48, 64, 128, 256, 512, 1024];
  const images = new Map();
  for (const size of sizes) {
    const png = await sharp(source)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    images.set(size, png);
    await fs.writeFile(`assets/icon-sizes/icon-${size}.png`, png);
    await fs.writeFile(`assets/icon-sizes/document-${size}.png`, png);
  }
  const { default: pngToIco } = await import("png-to-ico");
  const ico = await pngToIco(
    sizes.filter((size) => size <= 256).map((size) => images.get(size)),
  );
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
    const png = images.get(size),
      header = Buffer.alloc(8);
    header.write(type);
    header.writeUInt32BE(png.length + 8, 4);
    chunks.push(header, png);
  }
  const header = Buffer.alloc(8);
  header.write("icns");
  header.writeUInt32BE(
    8 + chunks.reduce((sum, bytes) => sum + bytes.length, 0),
    4,
  );
  const icns = Buffer.concat([header, ...chunks]);
  for (const name of ["icon", "document"]) {
    await fs.writeFile(`assets/${name}.png`, images.get(1024));
    await fs.writeFile(`assets/${name}.ico`, ico);
    await fs.writeFile(`assets/${name}.icns`, icns);
  }
  console.log(
    "Exported exact approved artwork at 16, 20, 24, 32, 48, 64, 128, 256, 512 and 1024 px.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
