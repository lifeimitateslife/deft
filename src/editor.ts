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
  redo,
  undo,
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
import { selectedTable, tableTransaction, type TableAction } from "./table";
import {
  formatTransaction,
  formatActive,
  selectedLink,
  type Format,
} from "./formatting";
import { fontStack } from "./preferences";
import {
  typingFormat,
  formattedTyping,
  toggleTyping,
  typingActive,
} from "./typing-format";
import type { Document, Settings } from "./types";
export class DocumentEditor {
  state: EditorState;
  view: EditorView | null = null;
  mode = new Compartment();
  appearance = new Compartment();
  editable = new Compartment();
  shutdown = new Compartment();
  scroll = { top: 0, left: 0 };
  constructor(
    public doc: Document,
    settings: Settings,
    private changed: (editor: DocumentEditor) => void,
  ) {
    if (
      doc.scroll &&
      Number.isFinite(doc.scroll.top) &&
      Number.isFinite(doc.scroll.left)
    )
      this.scroll = doc.scroll;
    this.state = EditorState.create({
      doc: normalize(doc.text),
      selection:
        doc.selection &&
        Number.isInteger(doc.selection.anchor) &&
        Number.isInteger(doc.selection.head)
          ? {
              anchor: Math.max(
                0,
                Math.min(normalize(doc.text).length, doc.selection.anchor),
              ),
              head: Math.max(
                0,
                Math.min(normalize(doc.text).length, doc.selection.head),
              ),
            }
          : undefined,
      extensions: [
        this.shutdown.of([]),
        exactSource.init(() => doc.text),
        sourceHistory,
        history(),
        typingFormat,
        formattedTyping,
        drawSelection(),
        highlightActiveLine(),
        bracketMatching(),
        search({ top: true }),
        keymap.of([
          { key: "Mod-z", run: undo, shift: redo },
          { key: "Mod-y", run: redo },
          { key: "Mod-Shift-z", run: redo },
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
  snapshot(active: string) {
    return {
      ...this.doc,
      active: this.doc.id === active,
      selection: {
        anchor: this.state.selection.main.anchor,
        head: this.state.selection.main.head,
      },
      scroll: this.view
        ? {
            top: this.view.scrollDOM.scrollTop,
            left: this.view.scrollDOM.scrollLeft,
          }
        : this.scroll,
    };
  }
  language() {
    return this.formatted
      ? [
          markdown({ codeLanguages: languages, extensions: [GFM] }),
          ...(this.doc.mode === "live"
            ? [liveMarkdown, liveBlocks(this.doc)]
            : []),
        ]
      : [];
  }
  get formatted() {
    return this.doc.kind === "markdown" || this.doc.formatted === true;
  }
  options(settings: Settings) {
    return [
      settings.wrap ? EditorView.lineWrapping : [],
      settings.lines ? lineNumbers() : [],
      EditorView.theme({
        "&": { fontSize: `${settings.fontSize}px` },
        ".cm-scroller": {
          fontFamily: fontStack(
            this.formatted && this.doc.mode === "source"
              ? settings.codeFontFamily
              : settings.fontFamily,
            this.formatted && this.doc.mode === "source",
          ),
        },
      }),
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
  lockForQuit(locked: boolean) {
    this.dispatch({
      effects: this.shutdown.reconfigure(
        locked
          ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
          : [],
      ),
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
    this.view.focus();
    if (name === "find" || name === "replace") {
      openSearchPanel(this.view);
      if (name === "replace")
        this.view.dom
          .querySelector<HTMLInputElement>('input[name="replace"]')
          ?.focus();
    }
    if (name === "line") gotoLine(this.view);
  }
  insert(before: string, after = "") {
    if (this.doc.readOnly || this.doc.mode === "read") return;
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
  format(action: Format, href?: string) {
    if (!this.formatted || this.doc.readOnly || this.doc.mode === "read")
      return;
    const spec =
      toggleTyping(this.state, action) ||
      formatTransaction(this.state, action, href);
    if (spec) this.dispatch(spec);
    this.view?.focus();
  }
  formatActive(action: Format) {
    return this.state.selection.main.empty
      ? typingActive(this.state, action)
      : formatActive(this.state, action);
  }
  get link() {
    return selectedLink(this.state);
  }
  get selectedTable() {
    return selectedTable(this.state);
  }
  table(action: TableAction) {
    if (!this.formatted || this.doc.readOnly || this.doc.mode === "read")
      return;
    const spec = tableTransaction(this.state, action);
    if (spec) this.dispatch(spec);
    this.view?.focus();
  }
}
