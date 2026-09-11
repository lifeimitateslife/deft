import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { isolateHistory } from "@codemirror/commands";
import { formatAllowed, type Format } from "./formatting";

const markers: Partial<Record<Format, string>> = {
  bold: "**",
  italic: "*",
  strike: "~~",
  "inline-code": "`",
};
const nodeFormats: Record<string, Format> = {
  StrongEmphasis: "bold",
  Emphasis: "italic",
  Strikethrough: "strike",
  InlineCode: "inline-code",
};
type Mark = { format: Format; marker: string };
type Segment = { text: string; marks: Mark[] };
type Run = {
  from: number;
  to: number;
  caret: number;
  before: Mark[];
  after: Mark[];
  segments: Segment[];
  delimiters?: { from: number; to: number; insert: string }[];
};
type Typing = { marks?: Mark[]; run?: Run };
const setTyping = StateEffect.define<Typing>();
export const typingFormat = StateField.define<Typing>({
  create: () => ({}),
  update(value, tr) {
    const effect = tr.effects.find((effect) => effect.is(setTyping));
    if (effect) return effect.value;
    if (tr.docChanged || tr.selection) return {};
    return value;
  },
});
function context(state: EditorState) {
  const caret = state.selection.main.head;
  let from = caret,
    to = caret;
  const marks: Mark[] = [],
    before: Mark[] = [],
    after: Mark[] = [];
  const delimiters: NonNullable<Run["delimiters"]> = [];
  for (
    let node = syntaxTree(state).resolveInner(caret, -1);
    node;
    node = node.parent!
  ) {
    const format = nodeFormats[node.name];
    if (!format) continue;
    const opening = node.firstChild,
      closing = node.lastChild;
    if (!opening || !closing || caret < opening.to || caret > closing.from)
      continue;
    const mark = { format, marker: state.sliceDoc(opening.from, opening.to) };
    if (/^_+$/.test(mark.marker)) {
      // Underscores cannot split emphasis within a word. Change only the two
      // existing delimiters when explicit typing needs a new format boundary.
      mark.marker = "*".repeat(mark.marker.length);
      delimiters.push(
        { from: opening.from, to: opening.to, insert: mark.marker },
        { from: closing.from, to: closing.to, insert: mark.marker },
      );
    }
    marks.unshift(mark);
    if (from === opening.to) from = node.from;
    else before.unshift(mark);
    if (to === closing.from) to = node.to;
    else after.unshift(mark);
  }
  return {
    marks,
    run: {
      from,
      to,
      caret,
      before,
      after,
      segments: [],
      delimiters: delimiters.filter(
        (change) => change.to <= from || change.from >= to,
      ),
    } as Run,
  };
}
export function typingActive(state: EditorState, action: Format) {
  return (
    state.selection.main.empty &&
    (state.field(typingFormat).marks ?? context(state).marks).some(
      (mark) => mark.format === action,
    )
  );
}
export function toggleTyping(state: EditorState, action: Format) {
  if (
    !markers[action] ||
    !state.selection.main.empty ||
    !formatAllowed(state, action)
  )
    return;
  const value = state.field(typingFormat);
  const marks = value.marks ?? context(state).marks;
  const next = marks.some((mark) => mark.format === action)
    ? marks.filter((mark) => mark.format !== action)
    : [...marks, { format: action, marker: markers[action]! }];
  return {
    effects: setTyping.of({ ...value, marks: next }),
    annotations: isolateHistory.of("full"),
  };
}
function transition(from: Mark[], to: Mark[]) {
  let shared = 0;
  while (
    shared < from.length &&
    shared < to.length &&
    from[shared].format === to[shared].format &&
    from[shared].marker === to[shared].marker
  )
    shared++;
  return (
    from
      .slice(shared)
      .reverse()
      .map((mark) => mark.marker)
      .join("") +
    to
      .slice(shared)
      .map((mark) => mark.marker)
      .join("")
  );
}
function writeRun(
  view: EditorView,
  run: Run,
  marks: Mark[],
  segments: Segment[],
) {
  let active = run.before,
    text = "";
  const rendered = segments.flatMap((segment) => {
    const [, leading, body, trailing] = segment.text.match(
      /^(\s*)([\s\S]*?)(\s*)$/,
    )!;
    return [
      ...(leading ? [{ text: leading, marks: [] as Mark[] }] : []),
      ...(body ? [{ text: body, marks: segment.marks }] : []),
      ...(trailing ? [{ text: trailing, marks: [] as Mark[] }] : []),
    ];
  });
  for (const segment of rendered) {
    text += transition(active, segment.marks) + segment.text;
    active = segment.marks;
  }
  const caret = run.from + text.length;
  text += transition(active, run.after);
  view.dispatch({
    changes: [
      ...(run.delimiters || []),
      { from: run.from, to: run.to, insert: text },
    ],
    selection: { anchor: caret },
    effects: setTyping.of({
      marks,
      run: {
        ...run,
        delimiters: undefined,
        segments,
        caret,
        to: run.from + text.length,
      },
    }),
    userEvent: "input.type",
  });
}
export const formattedTyping = [
  EditorView.inputHandler.of((view, from, to, text) => {
    const value = view.state.field(typingFormat);
    if (
      !value.marks ||
      from !== to ||
      view.state.readOnly ||
      /[\r\n]/.test(text)
    )
      return false;
    const run = value.run ?? context(view.state).run;
    if (from !== run.caret) return false;
    const segments = run.segments.map((segment) => ({ ...segment }));
    const last = segments.at(-1);
    if (last && JSON.stringify(last.marks) === JSON.stringify(value.marks))
      last.text += text;
    else segments.push({ text, marks: value.marks });
    writeRun(view, run, value.marks, segments);
    return true;
  }),
  keymap.of([
    {
      key: "Backspace",
      run(view) {
        const value = view.state.field(typingFormat),
          run = value.run;
        if (
          !run ||
          !view.state.selection.main.empty ||
          view.state.selection.main.head !== run.caret ||
          !run.segments.length ||
          view.state.readOnly
        )
          return false;
        const segments = run.segments.map((segment) => ({ ...segment }));
        const last = segments.at(-1)!;
        last.text = [...last.text].slice(0, -1).join("");
        if (!last.text) segments.pop();
        writeRun(view, run, value.marks ?? [], segments);
        return true;
      },
    },
  ]),
];
