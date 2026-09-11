const { execFileSync } = require("node:child_process");
const path = require("node:path");

// Run against the final bundle, including bundles mounted from a release DMG.
// Launch tests alone do not exercise Gatekeeper or validate the resource seal.
function verifyMac(app, distribution = false) {
  if (process.platform !== "darwin") {
    throw new Error("Mac package verification must run on macOS");
  }
  execFileSync(
    "codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", app],
    {
      stdio: "inherit",
    },
  );
  if (distribution) {
    execFileSync("xcrun", ["stapler", "validate", app], { stdio: "inherit" });
    execFileSync(
      "spctl",
      ["--assess", "--type", "execute", "--verbose=4", app],
      {
        stdio: "inherit",
      },
    );
  }
  console.log(
    distribution
      ? "Mac distribution checks passed"
      : "Mac signature integrity passed (not a distribution approval)",
  );
}

module.exports = { verifyMac };
if (require.main === module) {
  const app = process.argv[2];
  if (!app)
    throw new Error("Usage: node scripts/verify-mac.cjs APP [--distribution]");
  verifyMac(path.resolve(app), process.argv.includes("--distribution"));
}
