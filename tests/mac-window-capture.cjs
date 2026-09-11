// Optional compositor-test dependency, never loaded by the application.
const koffi = require(process.env.DEFT_KOFFI_MODULE);
const point = koffi.struct("ProbeCGPoint", { x: "double", y: "double" });
const size = koffi.struct("ProbeCGSize", { width: "double", height: "double" });
const rect = koffi.struct("ProbeCGRect", { origin: point, size });
const cg = koffi.load(
  "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics",
);
const cf = koffi.load(
  "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation",
);
const io = koffi.load("/System/Library/Frameworks/ImageIO.framework/ImageIO");
const capture = cg.func("CGWindowListCreateImage", "void*", [
  rect,
  "uint32",
  "uint32",
  "uint32",
]);
const url = cf.func("CFURLCreateFromFileSystemRepresentation", "void*", [
  "void*",
  "const uint8_t*",
  "long",
  "bool",
]);
const string = cf.func("CFStringCreateWithCString", "void*", [
  "void*",
  "const char*",
  "uint32",
]);
const release = cf.func("CFRelease", "void", ["void*"]);
const destination = io.func("CGImageDestinationCreateWithURL", "void*", [
  "void*",
  "void*",
  "long",
  "void*",
]);
const add = io.func("CGImageDestinationAddImage", "void", [
  "void*",
  "void*",
  "void*",
]);
const finalize = io.func("CGImageDestinationFinalize", "bool", ["void*"]);
module.exports = function (windowId, bounds, file) {
  // The controlled backdrop and target are both windows of this process.
  const image = capture(
    {
      origin: { x: bounds.x, y: bounds.y },
      size: { width: bounds.width, height: bounds.height },
    },
    12,
    windowId,
    0,
  );
  if (!image) throw Error("Own-window compositor capture failed");
  const bytes = Buffer.from(file);
  const fileUrl = url(null, bytes, bytes.length, false),
    png = string(null, "public.png", 0x08000100);
  const dest = destination(fileUrl, png, 1, null);
  try {
    add(dest, image, null);
    if (!finalize(dest)) throw Error("PNG write failed");
  } finally {
    for (const value of [dest, png, fileUrl, image]) release(value);
  }
};
