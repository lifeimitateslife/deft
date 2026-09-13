let native;
try {
  native = require("./native/windows-blur.node");
} catch {
  // Unsupported systems and missing binaries retain the existing system effect.
}
const attached = new WeakSet();
module.exports = function applyWindowsBlur(win, strength) {
  try {
    if (native && !attached.has(win)) {
      attached.add(win);
      win.once("closed", () => native.release());
    }
    return native?.apply(win.getNativeWindowHandle(), strength) === true;
  } catch {
    return false;
  }
};
