import React, { useEffect, useRef, useState } from "react";
import type { DocumentEditor } from "./editor";
import { shortcutLabel } from "./shortcuts";
import type { Format } from "./formatting";
const items: [string, Format][] = [
  ["Strikethrough", "strike"],
  ["Heading 1", "heading1"],
  ["Heading 2", "heading2"],
  ["Heading 3", "heading3"],
  ["Heading 4", "heading4"],
  ["Heading 5", "heading5"],
  ["Heading 6", "heading6"],
  ["Paragraph", "paragraph"],
  ["Bullet list", "bullet"],
  ["Numbered list", "number"],
  ["Task list", "task"],
  ["Blockquote", "quote"],
  ["Inline code", "inline-code"],
  ["Code block", "code-block"],
  ["Horizontal rule", "rule"],
  ["Remove link", "unlink"],
  ["Clear formatting", "clear"],
];
export function FormattingToolbar({
  editor,
  command,
}: {
  editor: DocumentEditor;
  command: (name: string) => unknown;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const disabled = editor.doc.readOnly || editor.doc.mode === "read";
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        if (root.current?.contains(document.activeElement))
          trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    root.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    setOpen(false);
  }, [disabled, editor]);
  function run(action: Format) {
    void command(`format-${action}`);
    setOpen(false);
  }
  return (
    <div
      className="format-tools"
      ref={root}
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest("button"))
          event.preventDefault();
      }}
    >
      <button
        title={`Bold (${shortcutLabel("format-bold")})`}
        aria-pressed={editor.formatActive("bold")}
        disabled={disabled}
        onClick={() => run("bold")}
      >
        <b>B</b>
      </button>
      <button
        title={`Italic (${shortcutLabel("format-italic")})`}
        aria-pressed={editor.formatActive("italic")}
        disabled={disabled}
        onClick={() => run("italic")}
      >
        <i>I</i>
      </button>
      <button
        title={`Insert or edit link (${shortcutLabel("format-link")})`}
        aria-pressed={editor.formatActive("link")}
        disabled={disabled}
        onClick={() => run("link")}
      >
        Link
      </button>
      <button
        title="Insert task"
        disabled={disabled}
        onClick={() => run("task")}
      >
        Task
      </button>
      <button
        title="Insert table"
        disabled={disabled}
        onClick={() => void command("table-insert")}
      >
        Table
      </button>
      <button
        ref={trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        Format
      </button>
      <div
        className="format-menu"
        role="menu"
        aria-label="Format"
        hidden={!open}
        inert={!open}
        onKeyDown={(event) => {
          const buttons = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          ];
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            trigger.current?.focus();
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            buttons[
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                    buttons.length
            ]?.focus();
          }
          if (event.key === "Tab") setOpen(false);
        }}
      >
        {items.map(([label, action]) => (
          <button
            role="menuitem"
            aria-label={label}
            key={action}
            onClick={() => run(action)}
            title={shortcutLabel(`format-${action}`)}
          >
            {label}
            <span className="shortcut">
              {shortcutLabel(`format-${action}`)}
            </span>
          </button>
        ))}
        <div role="separator" />
        {(
          [
            "row",
            "column",
            "remove-row",
            "remove-column",
            "left",
            "center",
            "right",
          ] as const
        ).map((action) => (
          <button
            role="menuitem"
            key={action}
            disabled={!editor.selectedTable}
            onClick={() => {
              editor.table(action);
              setOpen(false);
            }}
          >
            {
              {
                row: "Add table row",
                column: "Add table column",
                "remove-row": "Remove table row",
                "remove-column": "Remove table column",
                left: "Align column left",
                center: "Align column center",
                right: "Align column right",
              }[action]
            }
          </button>
        ))}
      </div>
    </div>
  );
}
export function LinkEditor({
  href,
  apply,
  cancel,
}: {
  href: string;
  apply: (href: string) => void;
  cancel: () => void;
}) {
  const [value, setValue] = useState(href || "https://");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <div
      className="link-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <form
        className="link-editor"
        role="dialog"
        aria-modal="true"
        aria-label="Insert or edit link"
        onSubmit={(event) => {
          event.preventDefault();
          apply(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            cancel();
          }
          if (event.key === "Tab") {
            const controls = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                "input,button",
              ),
            ];
            const index = controls.indexOf(
              document.activeElement as HTMLElement,
            );
            if (
              (event.shiftKey && index === 0) ||
              (!event.shiftKey && index === controls.length - 1)
            ) {
              event.preventDefault();
              controls[event.shiftKey ? controls.length - 1 : 0].focus();
            }
          }
        }}
      >
        <label>
          Link address
          <input
            ref={input}
            aria-label="Link address"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
          />
        </label>
        <div>
          <button type="button" onClick={cancel}>
            Cancel
          </button>
          <button type="submit">Apply link</button>
        </div>
      </form>
    </div>
  );
}
