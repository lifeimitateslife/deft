const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const code = readFileSync(
  require.resolve("../desktop/windows-blur.cjs"),
  "utf8",
);
test("Windows blur reports unsupported when native loading or application fails", () => {
  for (const native of [
    null,
    { apply: () => false },
    {
      apply: () => {
        throw Error("device lost");
      },
    },
  ]) {
    const context = {
      module: { exports: {} },
      require: () => {
        if (!native) throw Error("missing binary");
        return native;
      },
    };
    vm.runInNewContext(code, context);
    assert.equal(
      context.module.exports(
        { once: () => {}, getNativeWindowHandle: () => Buffer.alloc(8) },
        40,
      ),
      false,
    );
  }
});
test("Windows native resources are released once on window close", () => {
  const calls = [];
  let close;
  const context = {
    module: { exports: {} },
    require: () => ({
      apply: (handle, strength) => {
        calls.push(strength);
        return true;
      },
      release: () => calls.push("release"),
    }),
  };
  vm.runInNewContext(code, context);
  const win = {
    getNativeWindowHandle: () => Buffer.alloc(8),
    once: (event, callback) => {
      assert.equal(event, "closed");
      assert.equal(close, undefined);
      close = callback;
    },
  };
  assert.equal(context.module.exports(win, 73), true);
  assert.equal(context.module.exports(win, 0), true);
  close();
  assert.deepEqual(calls, [73, 0, "release"]);
});
