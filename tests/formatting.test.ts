import { test } from "node:test";
import assert from "node:assert/strict";
import { DocumentEditor } from "../src/editor";
import { preferences } from "../src/preferences";
import { undo } from "@codemirror/commands";
function editor(text: string, kind: "markdown" | "text" = "markdown") {
  return new DocumentEditor(
    {
      id: "fixture",
      path: null,
      name: "note",
      text,
      encoding: "utf8",
      bom: "",
      fingerprint: null,
      readOnly: false,
      kind,
      mode: "source",
    },
    preferences(),
    () => {},
  );
}
test("formatting toggles syntax at selection and clear keeps unrelated code and exact endings", () => {
  const doc = editor("hello\r\n\n```js\n**literal**\n```");
  doc.dispatch({ selection: { anchor: 0, head: 5 } });
  doc.format("bold");
  assert.equal(doc.doc.text, "**hello**\r\n\n```js\n**literal**\n```");
  doc.format("clear");
  assert.equal(doc.doc.text, "hello\r\n\n```js\n**literal**\n```");
  undo({
    get state() {
      return doc.state;
    },
    dispatch: (tr) => doc.dispatch(tr),
  });
  assert.equal(doc.doc.text, "**hello**\r\n\n```js\n**literal**\n```");
  const plain = editor("config = **raw**", "text");
  plain.format("heading1");
  assert.equal(plain.doc.text, "config = **raw**");
});

test("clear handles multiple spans; code/frontmatter and nested block containers stay intact", () => {
  const multi = editor("**one** and *two*");
  multi.dispatch({
    selection: { anchor: 2, head: multi.state.doc.length - 1 },
  });
  multi.format("clear");
  assert.equal(multi.doc.text, "one and two");
  for (const text of [
    "```js\nconst x = 1;\n```",
    "    const x = 1;",
    "---\ntitle: x\n---\nbody",
  ]) {
    const doc = editor(text);
    const offset = text.indexOf("x");
    doc.dispatch({ selection: { anchor: offset, head: offset + 1 } });
    doc.format("inline-code");
    assert.equal(doc.doc.text, text);
  }
  const nested = editor("> - nested");
  nested.dispatch({ selection: { anchor: 6 } });
  nested.format("heading2");
  assert.equal(nested.doc.text, "> - ## nested");
  const table = editor("| A | B |\n| --- | --- |\n| x | y |");
  table.dispatch({ selection: { anchor: table.state.doc.length - 1 } });
  table.table("remove-column");
  assert.equal(table.doc.text, "| A |\n| --- |\n| x |");
});
