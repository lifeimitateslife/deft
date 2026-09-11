const { spawnSync } = require("node:child_process");
const path = require("node:path");
const executable =
  process.platform === "win32"
    ? "release/win-unpacked/DEFT.exe"
    : `release/mac${process.arch === "arm64" ? "-arm64" : ""}/DEFT.app/Contents/MacOS/DEFT`;
const result = spawnSync(process.execPath, ["tests/native.mjs"], {
  stdio: "inherit",
  env: { ...process.env, DEFT_EXECUTABLE: path.resolve(executable) },
});
process.exitCode = result.status ?? 1;
