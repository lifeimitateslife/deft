let native;
try {
  native = require("./native/mac-blur.node");
} catch {
  // Missing or incompatible native binaries retain standard Electron vibrancy.
}
module.exports = function applyMacBlur(win, strength) {
  try {
    return native?.apply(win.getNativeWindowHandle(), strength) === true;
  } catch {
    return false;
  }
};
