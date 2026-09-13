if (process.platform !== "win32") process.exit(0);
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const version = require("electron/package.json").version;
const result = spawnSync(
  process.execPath,
  [
    require.resolve("node-gyp/bin/node-gyp.js"),
    "rebuild",
    "--directory=native",
    `--target=${version}`,
    "--dist-url=https://electronjs.org/headers",
    "--arch=x64",
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status || 1);
fs.mkdirSync("desktop/native", { recursive: true });
fs.copyFileSync(
  path.resolve("native/build/Release/windows-blur.node"),
  "desktop/native/windows-blur.node",
);
