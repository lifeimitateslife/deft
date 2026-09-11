const fs = require("node:fs/promises");
const sharp = require("sharp");
async function main() {
  await fs.mkdir("assets", { recursive: true });
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="32" y="32" width="960" height="960" rx="230" fill="#303b4d"/><path d="M300 245h174c205 0 310 100 310 266S679 779 474 779H300zm112 100v334h62c130 0 194-61 194-168s-64-166-194-166z" fill="#f6f8fc"/><path d="M216 826h592" stroke="#8bbaf5" stroke-width="18" stroke-linecap="round"/></svg>';
  await fs.writeFile("assets/icon.svg", svg);
  await sharp(Buffer.from(svg)).resize(1024).png().toFile("assets/icon.png");
  const sizes = [16, 32, 48, 64, 128, 256];
  const buffers = await Promise.all(
    sizes.map((size) => sharp(Buffer.from(svg)).resize(size).png().toBuffer()),
  );
  const { default: pngToIco } = await import("png-to-ico");
  await fs.writeFile("assets/icon.ico", await pngToIco(buffers));
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
  await fs.writeFile("assets/icon.icns", Buffer.concat([header, ...chunks]));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
