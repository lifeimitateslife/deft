import { syntaxTree } from "@codemirror/language";
import {
  EditorState,
  type ChangeSpec,
  type TransactionSpec,
} from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
import type { SyntaxNode } from "@lezer/common";
export type Format =
  | "bold"
  | "italic"
  | "strike"
  | "link"
  | "unlink"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "paragraph"
  | "bullet"
  | "number"
  | "task"
  | "quote"
  | "inline-code"
  | "code-block"
  | "rule"
  | "clear";
const inline: Partial<Record<Format, [string, string]>> = {
  bold: ["StrongEmphasis", "**"],
  italic: ["Emphasis", "*"],
  strike: ["Strikethrough", "~~"],
  "inline-code": ["InlineCode", "`"],
};
function containing(state: EditorState, name: string) {
  const selection = state.selection.main;
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(
    selection.from,
    1,
  );
  while (node) {
    if (node.name === name && node.to >= selection.to) return node;
    node = node.parent;
  }
}
export function formatActive(state: EditorState, action: Format) {
  const name = inline[action]?.[0] || (action === "link" ? "Link" : "");
  return !!name && !!containing(state, name);
}
export function selectedLink(state: EditorState) {
  const node = containing(state, "Link");
  const url = node?.getChild("URL");
  return url ? state.sliceDoc(url.from, url.to) : "";
}
export function formatAllowed(state: EditorState, action: Format) {
  const frontmatter = state.doc
    .toString()
    .match(/^---\n[\s\S]*?\n(?:---|\.\.\.)(?:\n|$)/);
  return (
    !(frontmatter && state.selection.main.from < frontmatter[0].length) &&
    !containing(state, "FencedCode") &&
    !containing(state, "CodeBlock") &&
    !(
      containing(state, "InlineCode") &&
      action !== "inline-code" &&
      action !== "clear"
    )
  );
}
export function formatTransaction(
  state: EditorState,
  action: Format,
  href?: string,
): TransactionSpec | undefined {
  const { from, to, empty } = state.selection.main;
  const tree = syntaxTree(state);
  if (!formatAllowed(state, action)) return;
  const changes: ChangeSpec[] = [];
  let selection: { anchor: number; head?: number } | undefined;
  const removeMarks = (node: SyntaxNode) => {
    const cursor = node.cursor();
    if (cursor.firstChild())
      do {
        if (
          [
            "EmphasisMark",
            "StrikethroughMark",
            "CodeMark",
            "LinkMark",
            "URL",
            "LinkTitle",
          ].includes(cursor.name)
        )
          changes.push({ from: cursor.from, to: cursor.to, insert: "" });
      } while (cursor.nextSibling());
  };
  if (inline[action]) {
    const [name, marker] = inline[action]!;
    const node = containing(state, name);
    if (node) removeMarks(node);
    else {
      if (containing(state, "InlineCode")) return;
      const selected = state.sliceDoc(from, to);
      const wrap =
        action === "inline-code"
          ? "`".repeat(
              Math.max(
                0,
                ...[...selected.matchAll(/`+/g)].map((m) => m[0].length),
              ) + 1,
            )
          : marker;
      const padding =
        action === "inline-code" && /^`|`$/.test(selected) ? " " : "";
      changes.push(
        { from, insert: wrap + padding },
        { from: to, insert: padding + wrap },
      );
      selection = {
        anchor: from + wrap.length + padding.length,
        head: to + wrap.length + padding.length,
      };
    }
  } else if (action === "link" || action === "unlink") {
    const node = containing(state, "Link");
    if (action === "unlink") {
      if (node) removeMarks(node);
    } else {
      if (
        !href ||
        !/^(https?:\/\/|mailto:|[^\s:]+$)/i.test(href) ||
        /[\r\n<>]/.test(href)
      )
        return;
      const url = href
        .replace(/\\/g, "%5C")
        .replace(/ /g, "%20")
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29");
      const existing = node?.getChild("URL");
      if (existing)
        changes.push({ from: existing.from, to: existing.to, insert: url });
      else {
        changes.push({ from, insert: "[" }, { from: to, insert: `](${url})` });
        selection = { anchor: from + 1, head: to + 1 };
      }
    }
  } else if (action === "clear") {
    const block = tree.resolveInner(from, 1);
    let start = empty ? state.doc.lineAt(from).from : from;
    let end = empty ? state.doc.lineAt(to).to : to;
    tree.iterate({
      from: start,
      to: end,
      enter(node) {
        if (["FencedCode", "CodeBlock"].includes(node.name)) return false;
        if (
          [
            "StrongEmphasis",
            "Emphasis",
            "Strikethrough",
            "Link",
            "InlineCode",
          ].includes(node.name)
        ) {
          const marks = [];
          const cursor = node.node.cursor();
          if (cursor.firstChild())
            do {
              if (
                ["EmphasisMark", "StrikethroughMark", "CodeMark"].includes(
                  cursor.name,
                )
              )
                marks.push({ from: cursor.from, to: cursor.to });
            } while (cursor.nextSibling());
          if (marks.length === 2) {
            const [opening, closing] = marks;
            if (start < closing.from && end > opening.to) {
              if (start <= opening.to)
                changes.push({
                  from: opening.from,
                  to: opening.to,
                  insert: "",
                });
              else
                changes.push({
                  from: start,
                  insert: state.sliceDoc(closing.from, closing.to),
                });
              if (end >= closing.from)
                changes.push({
                  from: closing.from,
                  to: closing.to,
                  insert: "",
                });
              else
                changes.push({
                  from: end,
                  insert: state.sliceDoc(opening.from, opening.to),
                });
            }
          } else if (node.name === "Link") removeMarks(node.node);
          if (node.name === "InlineCode") return false;
        }
        if (
          node.from >= start &&
          node.to <= end &&
          ["HeaderMark", "QuoteMark", "ListMark", "TaskMarker"].includes(
            node.name,
          )
        )
          changes.push({ from: node.from, to: node.to, insert: "" });
      },
    });
  } else if (action === "code-block") {
    const text = state.sliceDoc(from, to);
    const fence = "`".repeat(
      Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length)) + 1,
    );
    changes.push(
      { from, insert: `\n${fence}\n` },
      { from: to, insert: `\n${fence}\n` },
    );
    selection = {
      anchor: from + fence.length + 2,
      head: to + fence.length + 2,
    };
  } else if (action === "rule") {
    changes.push({ from: state.doc.lineAt(to).to, insert: "\n\n---\n" });
  } else {
    const first = state.doc.lineAt(from),
      last = state.doc.lineAt(to > from ? to - 1 : to);
    for (let number = first.number; number <= last.number; number++) {
      const line = state.doc.line(number);
      let protectedLine = false;
      tree.iterate({
        from: line.from,
        to: line.to,
        enter(node) {
          if (["FencedCode", "CodeBlock"].includes(node.name)) {
            protectedLine = true;
            return false;
          }
        },
      });
      if (protectedLine) continue;
      const marks: SyntaxNode[] = [];
      tree.iterate({
        from: line.from,
        to: line.to,
        enter(node) {
          if (
            ["HeaderMark", "ListMark", "TaskMarker", "QuoteMark"].includes(
              node.name,
            ) &&
            node.from >= line.from &&
            node.to <= line.to
          )
            marks.push(node.node);
        },
      });
      // Preserve outer containers. Only replace the marker belonging to this command's block.
      const blockStyle = action.startsWith("heading") || action === "paragraph";
      const targetMarks = blockStyle
        ? marks.filter((mark) => mark.name === "HeaderMark")
        : marks.filter((mark) =>
            action === "quote"
              ? mark.name === "QuoteMark"
              : ["ListMark", "TaskMarker"].includes(mark.name),
          );
      const containers = marks.filter(
        (mark) =>
          blockStyle &&
          ["QuoteMark", "ListMark", "TaskMarker"].includes(mark.name),
      );
      const indentation =
        line.from + (line.text.match(/^[ \t]*/)?.[0].length || 0);
      const targetStart = targetMarks.length
        ? Math.min(...targetMarks.map((mark) => mark.from))
        : containers.length
          ? Math.max(...containers.map((mark) => mark.to))
          : indentation;
      let prefixStart = targetStart;
      if (!targetMarks.length)
        while (
          prefixStart < line.to &&
          state.sliceDoc(prefixStart, prefixStart + 1) === " "
        )
          prefixStart++;
      let prefixEnd = targetMarks.length
        ? Math.max(...targetMarks.map((mark) => mark.to))
        : prefixStart;
      while (
        prefixEnd < line.to &&
        state.sliceDoc(prefixEnd, prefixEnd + 1) === " "
      )
        prefixEnd++;
      const prefix = action.startsWith("heading")
        ? "#".repeat(Number(action.slice(-1))) + " "
        : (
            {
              paragraph: "",
              bullet: "- ",
              number: `${number - first.number + 1}. `,
              task: "- [ ] ",
              quote: "> ",
            } as Record<string, string>
          )[action];
      if (prefix !== undefined)
        changes.push({ from: prefixStart, to: prefixEnd, insert: prefix });
    }
  }
  if (!changes.length) return;
  const unique = [
    ...new Map(
      changes.map((change) => [JSON.stringify(change), change]),
    ).values(),
  ];
  return {
    changes: unique,
    ...(selection ? { selection } : {}),
    annotations: isolateHistory.of("full"),
    userEvent: "input.format",
  };
}
