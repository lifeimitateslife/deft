const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || ""))
  throw Error("Usage: node scripts/update-downloads.cjs VERSION");
const release = JSON.parse(
  execFileSync(
    "gh",
    ["api", `repos/lifeimitateslife/deft/releases/tags/v${version}`],
    { encoding: "utf8" },
  ),
);
if (release.draft)
  throw Error("Publish the release before updating public downloads.");
const files = release.assets;
const windows = files.filter((asset) => asset.name.endsWith(".exe"));
const arm = files.filter((asset) => /arm64.*\.dmg$/i.test(asset.name));
const intel = files.filter((asset) => /x64.*\.dmg$/i.test(asset.name));
if ([windows, arm, intel].some((matches) => matches.length !== 1))
  throw Error("Expected exactly one published installer for each platform.");
const lines = [
  `**${version}${release.prerelease ? " prerelease" : ""}**`,
  "",
  ...[
    [windows[0], "Download for Windows (.exe, x64)"],
    [arm[0], "Download for Mac (Apple Silicon)"],
    [intel[0], "Download for Mac (Intel)"],
  ].map(([asset, label]) => `- [${label}](${asset.browser_download_url})`),
  "- [All releases](https://github.com/lifeimitateslife/deft/releases)",
];
const readme = fs.readFileSync("README.md", "utf8");
if (!readme.includes("<!-- downloads:start -->"))
  throw Error("README download markers are missing.");
fs.writeFileSync(
  "README.md",
  readme.replace(
    /<!-- downloads:start -->[\s\S]*?<!-- downloads:end -->/,
    `<!-- downloads:start -->\n${lines.join("\n")}\n<!-- downloads:end -->`,
  ),
);
console.log("Updated links from published release metadata:", release.html_url);
