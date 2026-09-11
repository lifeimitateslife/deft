import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { history, undo, redo } from "@codemirror/commands";
import { exactSource, sourceHistory, sourceOf, normalize } from "../src/source";
import { DocumentEditor } from "../src/editor";
import { preferences } from "../src/preferences";
test("caret formatting preserves source until typing and cannot enter frontmatter or code", () => {
  const editor = new DocumentEditor(
    {
      id: "caret",
      path: null,
      name: "test.md",
      kind: "markdown",
      mode: "live",
      text: "---\r\ntitle: test\r\n---\r\n\r\nplain\n",
      encoding: "utf8",
      bom: "",
      fingerprint: null,
      readOnly: false,
    },
    preferences(),
    () => {},
  );
  const original = editor.doc.text;
  editor.dispatch({ selection: { anchor: 10 } });
  editor.format("bold");
  assert.equal(editor.formatActive("bold"), false);
  assert.equal(editor.doc.text, original);
  editor.dispatch({ selection: { anchor: editor.state.doc.length } });
  editor.format("bold");
  assert.equal(editor.formatActive("bold"), true);
  assert.equal(editor.doc.text, original);
  editor.format("bold");
  assert.equal(editor.formatActive("bold"), false);
  assert.equal(editor.doc.text, original);
});
test("formatting through the editor keeps mixed endings in the actual document", () => {
  const editor = new DocumentEditor(
    {
      id: "test",
      path: null,
      name: "test.md",
      text: "a\r\nb\nc",
      encoding: "utf8",
      bom: "",
      fingerprint: null,
      readOnly: false,
      kind: "markdown",
      mode: "source",
    },
    {
      appearance: "light",
      material: "solid",
      wrap: true,
      lines: false,
      fontSize: 16,
      reducedMotion: true,
      autosave: false,
      recent: [],
    },
    () => {},
  );
  editor.dispatch({ selection: { anchor: 0, head: editor.state.doc.length } });
  editor.insert("**", "**");
  assert.equal(editor.doc.text, "**a\r\nb\nc**");
  editor.doc.mode = "read";
  editor.insert("unexpected");
  assert.equal(editor.doc.text, "**a\r\nb\nc**");
});
test("grouped undo and redo restore exact mixed endings", () => {
  const text = "a\r\nb\nc\r";
  let state = EditorState.create({
    doc: normalize(text),
    extensions: [exactSource.init(() => text), sourceHistory, history()],
  });
  for (const char of "typed")
    state = state.update({
      changes: { from: state.doc.length, insert: char },
      userEvent: "input.type",
    }).state;
  const target = {
    get state() {
      return state;
    },
    dispatch: (tr: any) => {
      state = tr.state;
    },
  };
  assert.equal(sourceOf(state), text + "typed");
  undo(target);
  assert.equal(sourceOf(state), text);
  redo(target);
  assert.equal(sourceOf(state), text + "typed");
});
test("wrapping a multiline selection inserts only boundary markers", () => {
  const text = "a\r\nb\nc";
  let state = EditorState.create({
    doc: normalize(text),
    extensions: [exactSource.init(() => text)],
  });
  state = state.update({
    changes: [
      { from: 0, insert: "**" },
      { from: state.doc.length, insert: "**" },
    ],
  }).state;
  assert.equal(sourceOf(state), "**a\r\nb\nc**");
});
