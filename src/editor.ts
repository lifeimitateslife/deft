import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  search,
  searchKeymap,
  openSearchPanel,
  gotoLine,
} from "@codemirror/search";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  syntaxTree,
} from "@codemirror/language";
import { GFM } from "@lezer/markdown";
import {
  exactSource,
  sourceEffect,
  sourceHistory,
  normalize,
  sourceOf,
} from "./source";
import { liveMarkdown, liveBlocks } from "./live";
import type { Document, Settings } from "./types";
export class DocumentEditor {
  state: EditorState;
  view: EditorView | null = null;
  mode = new Compartment();
  appearance = new Compartment();
  editable = new Compartment();
  scroll = { top: 0, left: 0 };
  constructor(
    public doc: Document,
    settings: Settings,
    private changed: (editor: DocumentEditor) => void,
  ) {
    this.state = EditorState.create({
      doc: normalize(doc.text),
      extensions: [
        exactSource.init(() => doc.text),
        sourceHistory,
        history(),
        drawSelection(),
        highlightActiveLine(),
        bracketMatching(),
        search({ top: true }),
        keymap.of([
          ...searchKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
          ...markdownKeymap,
        ]),
        syntaxHighlighting(defaultHighlightStyle),
        this.mode.of(this.language()),
        this.appearance.of(this.options(settings)),
        this.editable.of(
          EditorState.readOnly.of(doc.readOnly || doc.mode === "read"),
        ),
        EditorView.contentAttributes.of({
          "aria-label": "Document editor",
          spellcheck: "false",
        }),
        EditorView.updateListener.of((update) => {
          this.state = update.state;
          if (update.docChanged) {
            this.doc.text = sourceOf(update.state);
            this.doc.dirty = true;
          }
          this.changed(this);
        }),
      ],
    });
  }
  language() {
    return this.doc.kind === "markdown"
      ? [
          markdown({ codeLanguages: languages, extensions: [GFM] }),
          ...(this.doc.mode === "live"
            ? [liveMarkdown, liveBlocks(this.doc)]
            : []),
        ]
      : [];
  }
  options(settings: Settings) {
    return [
      settings.wrap ? EditorView.lineWrapping : [],
      settings.lines ? lineNumbers() : [],
      EditorView.theme({ "&": { fontSize: `${settings.fontSize}px` } }),
    ];
  }
  mount(parent: HTMLElement) {
    this.view = new EditorView({ state: this.state, parent });
    this.view.scrollDOM.scrollTop = this.scroll.top;
    this.view.scrollDOM.scrollLeft = this.scroll.left;
  }
  unmount() {
    if (this.view) {
      this.scroll = {
        top: this.view.scrollDOM.scrollTop,
        left: this.view.scrollDOM.scrollLeft,
      };
      this.state = this.view.state;
      this.view.destroy();
      this.view = null;
    }
  }
  dispatch(spec: any) {
    if (this.view) this.view.dispatch(spec);
    else {
      const tr = this.state.update(spec);
      this.state = tr.state;
      if (tr.docChanged) {
        this.doc.text = sourceOf(this.state);
        this.doc.dirty = true;
      }
      this.changed(this);
    }
  }
  configure(settings: Settings) {
    this.dispatch({
      effects: [
        this.mode.reconfigure(this.language()),
        this.appearance.reconfigure(this.options(settings)),
        this.editable.reconfigure(
          EditorState.readOnly.of(
            this.doc.readOnly || this.doc.mode === "read",
          ),
        ),
      ],
    });
  }
  reload(doc: Document) {
    this.doc = doc;
    this.dispatch({
      changes: {
        from: 0,
        to: this.state.doc.length,
        insert: normalize(doc.text),
      },
      effects: sourceEffect.of(doc.text),
    });
    this.doc.dirty = false;
  }
  command(name: string) {
    if (!this.view) return;
    if (name === "find") openSearchPanel(this.view);
    if (name === "line") gotoLine(this.view);
    this.view.focus();
  }
  insert(before: string, after = "") {
    if (this.doc.readOnly) return;
    const { from, to } = this.state.selection.main;
    this.dispatch({
      changes: after
        ? [
            { from, insert: before },
            { from: to, insert: after },
          ]
        : { from, to, insert: before },
      selection: {
        anchor: from + before.length,
        head: after ? to + before.length : from + before.length,
      },
    });
    this.view?.focus();
  }
  get selectedTable() {
    let node = syntaxTree(this.state).resolveInner(
      this.state.selection.main.head,
      -1,
    );
    while (node.parent && node.name !== "Table") node = node.parent;
    return node.name === "Table" ? node : undefined;
  }
  table(action: "row" | "column") {
    if (this.doc.readOnly || this.doc.mode === "read") return;
    const node = this.selectedTable;
    if (!node) return;
    const first = this.state.doc.lineAt(node.from);
    let cells = 0;
    node
      .getChild("TableHeader")
      ?.getChildren("TableCell")
      .forEach(() => cells++);
    if (action === "row") {
      const line = this.state.doc.lineAt(this.state.selection.main.head);
      this.dispatch({
        changes: {
          from: line.to,
          insert: "\n|" + Array(cells).fill(" Text |").join(""),
        },
      });
    } else {
      const changes = [];
      for (
        let number = first.number;
        number <= this.state.doc.lineAt(node.to).number;
        number++
      ) {
        const line = this.state.doc.line(number);
        changes.push({
          from: line.to,
          insert: number === first.number + 1 ? " --- |" : " Text |",
        });
      }
      this.dispatch({ changes });
    }
    this.view?.focus();
  }
}
