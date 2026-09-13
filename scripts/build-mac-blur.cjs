const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
if (process.platform === "darwin") {
  const headers = path.resolve(
    path.dirname(process.execPath),
    "../include/node",
  );
  if (!fs.existsSync(path.join(headers, "node_api.h")))
    throw Error(`Node development headers are missing: ${headers}`);
  fs.mkdirSync("desktop/native", { recursive: true });
  execFileSync(
    "xcrun",
    [
      "clang++",
      "-std=c++17",
      "-bundle",
      "-undefined",
      "dynamic_lookup",
      "-framework",
      "Cocoa",
      "-mmacosx-version-min=11.0",
      "-I",
      headers,
      "native/mac-blur.mm",
      "-o",
      "desktop/native/mac-blur.node",
    ],
    { stdio: "inherit" },
  );
}
