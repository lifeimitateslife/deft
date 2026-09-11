import { test } from "node:test";
import assert from "node:assert/strict";
import { preferences, appearanceDefaults } from "../src/preferences";
test("old preferences migrate without replacing custom data or unrelated preferences", () => {
  const old = {
    appearance: "dark",
    autosave: true,
    recent: ["note.txt"],
    future: "keep",
    custom: {
      chrome: "#101010",
      paper: "#202020",
      text: "#eeeeee",
      accent: "#99aaff",
    },
  };
  const result = preferences(old);
  assert.equal(result.restoreSession, true);
  assert.equal(result.backgroundBlur, true);
  assert.equal(result.appearance, "dark");
  assert.deepEqual(result.custom, old.custom);
  const reset = { ...result, ...appearanceDefaults };
  assert.equal(reset.autosave, true);
  assert.deepEqual(reset.recent, ["note.txt"]);
  assert.equal((reset as any).future, "keep");
});
test("appearance reset preserves reduced motion and unrelated settings across persistence", () => {
  const saved = preferences({
    reducedMotion: true,
    autosave: true,
    recent: ["keep.txt"],
    glassOpacity: 91,
    backgroundBlur: false,
    fontFamily: "Georgia",
    fontSize: 24,
  });
  const reset = preferences(
    JSON.parse(JSON.stringify({ ...saved, ...appearanceDefaults })),
  );
  assert.equal(reset.reducedMotion, true);
  assert.equal(reset.autosave, true);
  assert.deepEqual(reset.recent, ["keep.txt"]);
  assert.equal(reset.appearance, "system");
  assert.equal(reset.fontFamily, "");
  assert.equal(reset.fontSize, 16);
  assert.equal(reset.glassOpacity, 68);
  assert.equal(reset.backgroundBlur, true);
});
