import { syntaxTree } from "@codemirror/language";
import { StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { renderMarkdown } from "./markdown";
import type { Document } from "./types";
class RenderedBlock extends WidgetType {
  constructor(
    readonly source: string,
    readonly at: number,
    readonly doc: Document,
  ) {
    super();
  }
  eq(other: RenderedBlock) {
    return this.source === other.source && this.at === other.at;
  }
  toDOM(view: EditorView) {
    const wrapper = document.createElement("div");
    wrapper.className = "live-rendered";
    const body = document.createElement("div");
    body.textContent = this.source;
    wrapper.append(body);
    const edit = document.createElement("button");
    edit.textContent = "Edit source";
    edit.setAttribute("aria-label", "Edit table source");
    edit.onclick = () => {
      view.dispatch({ selection: { anchor: this.at } });
      view.focus();
    };
    wrapper.append(edit);
    renderMarkdown(this.source, this.doc).then((html) => {
      if (wrapper.isConnected) {
        body.innerHTML = html;
        view.requestMeasure();
      }
    });
    return wrapper;
  }
  ignoreEvent() {
    return true;
  }
}
class ImageWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly at: number,
    readonly doc: Document,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return this.source === other.source && this.at === other.at;
  }
  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = "live-image";
    span.textContent = this.source;
    renderMarkdown(this.source, this.doc).then((html) => {
      if (span.isConnected) {
        span.innerHTML = html;
        view.requestMeasure();
      }
    });
    span.onclick = () => {
      view.dispatch({ selection: { anchor: this.at } });
      view.focus();
    };
    return span;
  }
  ignoreEvent() {
    return true;
  }
}
export function liveBlocks(doc: Document) {
  return StateField.define<DecorationSet>({
    create: (state) => build(state),
    update: (value, tr) =>
      tr.docChanged || tr.selection ? build(tr.state) : value,
    provide: (field) => EditorView.decorations.from(field),
  });
  function build(state: any) {
    const ranges: any[] = [];
    const head = state.selection.main.head;
    syntaxTree(state).iterate({
      enter: (node) => {
        const source = state.sliceDoc(node.from, node.to);
        if (
          (node.name === "Table" ||
            (node.name === "Paragraph" && source.includes("$"))) &&
          (head < node.from || head > node.to)
        ) {
          ranges.push(
            Decoration.replace({
              block: true,
              widget: new RenderedBlock(source, node.from, doc),
            }).range(node.from, node.to),
          );
          return false;
        }
        if (node.name === "Image" && (head < node.from || head > node.to)) {
          ranges.push(
            Decoration.replace({
              widget: new ImageWidget(
                state.sliceDoc(node.from, node.to),
                node.from,
                doc,
              ),
            }).range(node.from, node.to),
          );
          return false;
        }
      },
    });
    return Decoration.set(ranges, true);
  }
}
class Checkbox extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly at: number,
  ) {
    super();
  }
  eq(other: Checkbox) {
    return this.checked === other.checked && this.at === other.at;
  }
  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.setAttribute("aria-label", "Toggle task");
    input.onmousedown = (event) => event.preventDefault();
    input.onchange = () => {
      if (!view.state.readOnly)
        view.dispatch({
          changes: {
            from: this.at + 1,
            to: this.at + 2,
            insert: this.checked ? " " : "x",
          },
        });
    };
    return input;
  }
  ignoreEvent() {
    return true;
  }
}
function decorations(view: EditorView) {
  const ranges: any[] = [];
  const active = view.state.doc.lineAt(view.state.selection.main.head);
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges)
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name,
          begin = node.from,
          end = node.to;
        if (name.startsWith("ATXHeading"))
          ranges.push(
            Decoration.line({ class: `live-heading h${name.slice(-1)}` }).range(
              view.state.doc.lineAt(begin).from,
            ),
          );
        const cls: Record<string, string> = {
          StrongEmphasis: "live-strong",
          Emphasis: "live-em",
          Strikethrough: "live-strike",
          InlineCode: "live-code",
          Blockquote: "live-quote",
          Link: "live-link",
        };
        if (cls[name])
          ranges.push(Decoration.mark({ class: cls[name] }).range(begin, end));
        const inactive = end < active.from || begin > active.to;
        if (
          inactive &&
          [
            "HeaderMark",
            "EmphasisMark",
            "CodeMark",
            "StrikethroughMark",
            "QuoteMark",
          ].includes(name)
        )
          ranges.push(Decoration.replace({}).range(begin, end));
        if (name === "TaskMarker" && inactive) {
          ranges.push(
            Decoration.replace({
              widget: new Checkbox(
                view.state.sliceDoc(begin, end).toLowerCase() === "[x]",
                begin,
              ),
            }).range(begin, end),
          );
        }
      },
    });
  return Decoration.set(ranges, true);
}
export const liveMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorations(view);
    }
    update(update: any) {
      if (update.docChanged || update.selectionSet || update.viewportChanged)
        this.decorations = decorations(update.view);
    }
  },
  { decorations: (value) => value.decorations },
);
