const { spawnSync } = require("node:child_process");
const path = require("node:path");
const executable =
  process.platform === "win32"
    ? "release/win-unpacked/DEFT.exe"
    : `release/mac${process.arch === "arm64" ? "-arm64" : ""}/DEFT.app/Contents/MacOS/DEFT`;
if (process.platform === "darwin") {
  require("./verify-mac.cjs").verifyMac(path.resolve(executable, "../../.."));
}
for (const test of [
  "tests/native.mjs",
  "tests/second-instance.mjs",
  "tests/session.mjs",
  "tests/last-tab.mjs",
  "tests/appearance.mjs",
  "tests/preferences-ui.mjs",
  "tests/formatting-shortcuts.mjs",
  "tests/save-in-flight.mjs",
  "tests/clipboard.mjs",
  "tests/update-notice.mjs",
  "tests/tabs-recents.mjs",
  ...(process.platform === "darwin" ? ["tests/mac-blur-ui.mjs"] : []),
]) {
  const result = spawnSync(process.execPath, [test], {
    stdio: "inherit",
    env: {
      ...process.env,
      DEFT_EXECUTABLE: path.resolve(executable),
      DEFT_FORMATTED_PASTE: "1",
    },
  });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
