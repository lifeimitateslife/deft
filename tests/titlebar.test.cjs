const { test } = require("node:test");
const assert = require("node:assert/strict");
const { titlebarOptions, updateTitlebar } = require("../desktop/titlebar.cjs");
test("title surfaces retain OS caption controls on Windows and Mac", () => {
  assert.equal(titlebarOptions("win32").titleBarStyle, "hidden");
  assert.equal(titlebarOptions("darwin").titleBarOverlay, true);
  assert.deepEqual(titlebarOptions("linux"), {});
  const updates = [];
  const win = { setTitleBarOverlay: (value) => updates.push(value) };
  updateTitlebar(win, { appearance: "dark" }, {}, "win32");
  assert.equal(updates[0].symbolColor, "#e7e8eb");
  assert.equal(updates[0].color, "#00000000");
  updateTitlebar(
    win,
    { appearance: "custom", custom: { text: "invalid" } },
    {},
    "win32",
  );
  assert.equal(updates[1].symbolColor, "#242930");
  updateTitlebar(win, {}, {}, "darwin");
  assert.equal(updates.length, 2);
});
