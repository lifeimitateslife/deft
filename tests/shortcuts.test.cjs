const { test } = require("node:test");
const assert = require("node:assert/strict");
const { shortcutFor } = require("../desktop/shortcuts.cjs");
test("application shortcuts use Windows Ctrl and preserve macOS Hide Others", () => {
  const input = { type: "keyDown", key: "h", control: true };
  assert.equal(shortcutFor(input, "win32"), "replace");
  assert.equal(
    shortcutFor({ ...input, control: false, meta: true, alt: true }, "darwin"),
    undefined,
  );
  assert.equal(
    shortcutFor({ type: "keyDown", key: "f", meta: true, alt: true }, "darwin"),
    "replace",
  );
  assert.equal(
    shortcutFor({ type: "keyDown", key: "Tab", meta: true }, "darwin"),
    undefined,
  );
  assert.equal(
    shortcutFor({ type: "keyDown", key: "Tab", control: true }, "darwin"),
    "next-tab",
  );
});
test("shifted punctuation and typing modifiers do not collide", () => {
  assert.equal(
    shortcutFor(
      { type: "keyDown", key: "@", code: "Digit2", control: true, alt: true },
      "win32",
    ),
    undefined,
  );
  assert.equal(
    shortcutFor(
      {
        type: "keyDown",
        key: "2",
        code: "Digit2",
        control: true,
        alt: true,
        altGraph: true,
      },
      "win32",
    ),
    undefined,
  );
  assert.equal(
    shortcutFor(
      { type: "keyDown", key: "*", code: "Digit8", control: true, shift: true },
      "win32",
    ),
    "format-bullet",
  );
  assert.equal(
    shortcutFor(
      { type: "keyDown", key: "b", control: true, shift: true },
      "win32",
    ),
    undefined,
  );
  assert.equal(
    shortcutFor(
      { type: "keyDown", key: "b", control: true, isComposing: true },
      "win32",
    ),
    undefined,
  );
  assert.equal(
    shortcutFor({ type: "keyUp", key: "b", control: true }, "win32"),
    undefined,
  );
  assert.equal(
    shortcutFor(
      { type: "keyDown", key: "n", control: true, shift: true },
      "win32",
    ),
    "new-markdown",
  );
});
