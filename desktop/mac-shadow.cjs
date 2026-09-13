// Refresh after the renderer's 140 ms panel transition has settled. Immediate
// invalidation alone can cache opaque pixels from a fading Preferences panel.
const pending = new WeakMap();
const attached = new WeakSet();
module.exports = function refreshMacShadow(win) {
  clearTimeout(pending.get(win));
  win.invalidateShadow();
  const timer = setTimeout(() => {
    pending.delete(win);
    if (!win.isDestroyed()) win.invalidateShadow();
  }, 200);
  timer.unref();
  pending.set(win, timer);
  if (!attached.has(win)) {
    attached.add(win);
    win.once("closed", () => {
      clearTimeout(pending.get(win));
      pending.delete(win);
    });
  }
};
