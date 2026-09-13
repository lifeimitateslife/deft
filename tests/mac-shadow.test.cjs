const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");

test("Mac shadow refresh coalesces transitions and cancels pending work on close", () => {
  const timers = new Set();
  const context = {
    module: { exports: {} },
    setTimeout(callback, delay) {
      assert.equal(delay, 200);
      const timer = { callback, unref() {} };
      timers.add(timer);
      return timer;
    },
    clearTimeout(timer) {
      timers.delete(timer);
    },
  };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../desktop/mac-shadow.cjs"), "utf8"),
    context,
  );
  let invalidations = 0,
    closed,
    destroyed = false;
  const win = {
    invalidateShadow() {
      invalidations++;
    },
    isDestroyed() {
      return destroyed;
    },
    once(event, callback) {
      assert.equal(event, "closed");
      assert.equal(closed, undefined);
      closed = callback;
    },
  };
  const refresh = context.module.exports;
  refresh(win);
  refresh(win);
  assert.equal(invalidations, 2);
  assert.equal(timers.size, 1);
  const timer = [...timers][0];
  timers.delete(timer);
  timer.callback();
  assert.equal(invalidations, 3);
  refresh(win);
  const pending = [...timers][0];
  destroyed = true;
  closed();
  assert.equal(timers.size, 0);
  pending.callback();
  assert.equal(invalidations, 4);
});
