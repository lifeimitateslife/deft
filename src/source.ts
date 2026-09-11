import {
  StateEffect,
  StateField,
  EditorState,
  Transaction,
} from "@codemirror/state";
import { invertedEffects } from "@codemirror/commands";
export const normalize = (text: string) => text.replace(/\r\n?|\n/g, "\n");
export const sourceEffect = StateEffect.define<string>();
function rawOffset(text: string, offset: number) {
  let raw = 0,
    normalized = 0;
  while (raw < text.length && normalized < offset) {
    if (text[raw] === "\r" && text[raw + 1] === "\n") raw++;
    raw++;
    normalized++;
  }
  return raw;
}
export function patchSource(text: string, tr: Transaction) {
  const eol = text.match(/\r\n|\r|\n/)?.[0] || "\n";
  let result = "",
    last = 0;
  tr.changes.iterChanges((from, to, _a, _b, insert) => {
    const start = rawOffset(text, from),
      end = rawOffset(text, to);
    result += text.slice(last, start) + insert.toString().replace(/\n/g, eol);
    last = end;
  });
  return result + text.slice(last);
}
export const exactSource = StateField.define<string>({
  create: () => "",
  update: (value, tr) => {
    const snapshots = tr.effects.filter((e) => e.is(sourceEffect));
    if (snapshots.length) {
      const displayed = tr.newDoc.toString();
      const explicit = snapshots.find((e) => normalize(e.value) === displayed);
      if (explicit) return explicit.value;
    }
    if (tr.docChanged) return patchSource(value, tr);
    return value;
  },
});
export const sourceHistory = invertedEffects.of((tr) =>
  tr.docChanged ? [sourceEffect.of(tr.startState.field(exactSource))] : [],
);
export const sourceOf = (state: EditorState) => state.field(exactSource);
