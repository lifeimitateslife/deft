const fs = require("node:fs");
const path = require("node:path");
const lock = require("../package-lock.json");
const root = path.resolve(__dirname, "..");
const sections = [
  "DEFT third-party notices\n\nElectron and Chromium notices are also included beside the installed executable.\n",
];
for (const [location, record] of Object.entries(lock.packages).sort(
  ([a], [b]) => a.localeCompare(b),
)) {
  if (!location || !fs.existsSync(path.join(root, location))) continue;
  const directory = path.join(root, location);
  let pkg;
  try {
    pkg = JSON.parse(
      fs.readFileSync(path.join(directory, "package.json"), "utf8"),
    );
  } catch {
    continue;
  }
  const licenses = fs
    .readdirSync(directory)
    .filter(
      (name) =>
        /^(license|licence|copying|notice)(\.|$)/i.test(name) &&
        fs.statSync(path.join(directory, name)).isFile(),
    );
  sections.push(
    `\n${pkg.name} ${record.version}\nLicense: ${JSON.stringify(pkg.license || "See package notices")}\n${licenses.map((name) => fs.readFileSync(path.join(directory, name), "utf8")).join("\n")}\n`,
  );
}
fs.writeFileSync(
  path.join(root, "THIRD-PARTY-NOTICES.txt"),
  sections.join("\n"),
);
