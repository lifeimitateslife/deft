import { syntaxTree } from "@codemirror/language";
import type {
  EditorState,
  ChangeSpec,
  TransactionSpec,
} from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
export type TableAction =
  | "row"
  | "column"
  | "remove-row"
  | "remove-column"
  | "left"
  | "center"
  | "right";
export function selectedTable(state: EditorState) {
  let node = syntaxTree(state).resolveInner(state.selection.main.head, -1);
  while (node.parent && node.name !== "Table") node = node.parent;
  return node.name === "Table" ? node : undefined;
}
export function tableTransaction(
  state: EditorState,
  action: TableAction,
): TransactionSpec | undefined {
  const node = selectedTable(state);
  if (!node) return;
  // Nested table containers require preserving their Markdown prefixes; leave them intact.
  if (node.parent?.name !== "Document") return;
  const header = node.getChild("TableHeader");
  if (!header) return;
  const rows = [header, ...node.getChildren("TableRow")];
  const count = header.getChildren("TableCell").length;
  const current =
    rows.find(
      (row) =>
        row.from <= state.selection.main.head &&
        row.to >= state.selection.main.head,
    ) || header;
  const cells = current.getChildren("TableCell");
  const found = cells.findIndex((cell) => cell.to >= state.selection.main.head);
  const column = found < 0 ? Math.max(0, cells.length - 1) : found;
  const first = state.doc.lineAt(header.from),
    delimiter = state.doc.line(first.number + 1);
  const changes: ChangeSpec[] = [];
  if (action === "row") {
    const after =
      current === header ? delimiter : state.doc.lineAt(current.from);
    changes.push({
      from: after.to,
      insert: "\n|" + Array(count).fill(" Text |").join(""),
    });
  } else if (action === "remove-row") {
    if (current === header) return;
    const line = state.doc.lineAt(current.from);
    changes.push({ from: line.from - 1, to: line.to, insert: "" });
  } else {
    if (action === "remove-column" && count <= 1) return;
    if (action === "column" || action === "remove-column")
      for (const row of rows) {
        const values = row
          .getChildren("TableCell")
          .map((cell) => state.sliceDoc(cell.from, cell.to));
        while (values.length < count) values.push("");
        if (action === "column") values.splice(column + 1, 0, "Text");
        else values.splice(column, 1);
        const line = state.doc.lineAt(row.from);
        changes.push({
          from: line.from,
          to: line.to,
          insert: "| " + values.join(" | ") + " |",
        });
      }
    const values = delimiter.text
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((value) => value.trim());
    if (action === "column") values.splice(column + 1, 0, "---");
    else if (action === "remove-column") values.splice(column, 1);
    else
      values[column] =
        action === "center" ? ":---:" : action === "right" ? "---:" : ":---";
    changes.push({
      from: delimiter.from,
      to: delimiter.to,
      insert: "| " + values.join(" | ") + " |",
    });
  }
  return {
    changes,
    annotations: isolateHistory.of("full"),
    userEvent: "input.format",
  };
}
