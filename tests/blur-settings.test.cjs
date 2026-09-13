const { test } = require("node:test");
const assert = require("node:assert/strict");
const { blurSettings } = require("../desktop/blur-settings.cjs");
test("legacy blur values migrate to a bounded strength independently of opacity", () => {
  assert.deepEqual(blurSettings({ backgroundBlur: false, glassOpacity: 80 }), {
    backgroundBlur: false,
    backgroundBlurStrength: 0,
  });
  assert.equal(
    blurSettings({ backgroundBlur: true }).backgroundBlurStrength,
    40,
  );
  assert.equal(blurSettings({}).backgroundBlurStrength, 40);
  for (const [input, expected] of [
    [-5, 0],
    [150, 100],
    [24.8, 25],
    [NaN, 40],
    [Infinity, 40],
    ["70", 40],
  ])
    assert.equal(
      blurSettings({ backgroundBlurStrength: input }).backgroundBlurStrength,
      expected,
    );
});
test("numeric and legacy updates keep both blur fields consistent", () => {
  const current = { backgroundBlur: true, backgroundBlurStrength: 70 };
  assert.deepEqual(blurSettings(current, { backgroundBlur: false }), {
    backgroundBlur: false,
    backgroundBlurStrength: 0,
  });
  assert.equal(
    blurSettings(current, { backgroundBlurStrength: 20 })
      .backgroundBlurStrength,
    20,
  );
  assert.equal(
    blurSettings(current, { backgroundBlur: false, backgroundBlurStrength: 65 })
      .backgroundBlur,
    true,
  );
  assert.equal(
    blurSettings(current, { glassOpacity: 10 }).backgroundBlurStrength,
    70,
  );
  assert.equal(
    blurSettings({ backgroundBlur: false }, { backgroundBlur: true })
      .backgroundBlurStrength,
    40,
  );
});
test("Mac adapter falls back on missing or failing native support", () => {
  const vm = require("node:vm"),
    fs = require("node:fs");
  const code = fs.readFileSync(
    require.resolve("../desktop/mac-blur.cjs"),
    "utf8",
  );
  for (const [native, expected] of [
    [null, false],
    [{ apply: () => false }, false],
    [
      {
        apply: () => {
          throw Error("native unavailable");
        },
      },
      false,
    ],
    [{ apply: () => true }, true],
  ]) {
    const context = {
      module: { exports: {} },
      require: () => {
        if (!native) throw Error("missing addon");
        return native;
      },
    };
    vm.runInNewContext(code, context);
    assert.equal(
      context.module.exports(
        { getNativeWindowHandle: () => Buffer.alloc(8) },
        40,
      ),
      expected,
    );
  }
});
