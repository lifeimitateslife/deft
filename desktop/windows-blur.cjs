let native;
try {
  native = require("./native/windows-blur.node");
} catch {
  // Unsupported systems and missing binaries retain the existing system effect.
}
module.exports = function applyWindowsBlur(win, strength) {
  try {
    return native?.apply(win.getNativeWindowHandle(), strength) === true;
  } catch {
    return false;
  }
};
