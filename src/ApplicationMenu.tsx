import React, { useEffect, useRef, useState } from "react";
import type { DocumentEditor } from "./editor";
import type { Settings } from "./types";
import { shortcutLabel } from "./shortcuts";
import type { Format } from "./formatting";
export const formatItems = [
  ["Bold", "format-bold"],
  ["Italic", "format-italic"],
  ["Strikethrough", "format-strike"],
  ["Insert or edit link…", "format-link"],
  ["Remove link", "format-unlink"],
  ...Array.from({ length: 6 }, (_, i) => [
    `Heading ${i + 1}`,
    `format-heading${i + 1}`,
  ]),
  ["Paragraph", "format-paragraph"],
  ["Bullet list", "format-bullet"],
  ["Numbered list", "format-number"],
  ["Task list", "format-task"],
  ["Insert table", "table-insert"],
  ["Blockquote", "format-quote"],
  ["Inline code", "format-inline-code"],
  ["Code block", "format-code-block"],
  ["Horizontal rule", "format-rule"],
  ["Clear formatting", "format-clear"],
];
export function ApplicationMenu({
  current,
  settings,
  command,
  open,
}: {
  current?: DocumentEditor;
  settings: Settings;
  command: (name: string) => unknown;
  open: (paths?: string[]) => unknown;
}) {
  const [shown, setShown] = useState(false),
    [group, setGroup] = useState(""),
    [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    recentTrigger = useRef<HTMLButtonElement>(null),
    list = useRef<HTMLDivElement>(null);
  const editable =
    !!current && !current.doc.readOnly && current.doc.mode !== "read";
  const groups: Record<string, string[][]> = {
    File: [
      ["New Text", "new-text"],
      ["New Markdown", "new-markdown"],
      ["New tab", "new-text"],
      ["Open…", "open"],
      ["Recent Files", "recent"],
      ["Save", "save"],
      ["Save As…", "save-as"],
      ["Export HTML…", "export"],
      ["Save as PDF…", "pdf"],
      ["Print…", "print"],
      ["Close tab", "close"],
      ["Quit", "quit"],
    ],
    Edit: [
      ["Undo", "edit-undo"],
      ["Redo", "edit-redo"],
      ["Cut", "edit-cut"],
      ["Copy", "edit-copy"],
      ["Paste", "edit-paste"],
      ["Select all", "edit-selectAll"],
      ["Find and replace…", "find"],
      ["Replace…", "replace"],
      ["Go to line…", "line"],
    ],
    Format: [
      ...formatItems,
      ...(current?.selectedTable
        ? [
            ["Add table row", "table-row"],
            ["Add table column", "table-column"],
            ["Remove table row", "table-remove-row"],
            ["Remove table column", "table-remove-column"],
            ["Align column left", "table-left"],
            ["Align column center", "table-center"],
            ["Align column right", "table-right"],
          ]
        : []),
    ],
    View: [
      ...(current?.formatted
        ? [
            ["Live", "mode-live"],
            [
              current.doc.kind === "markdown" ? "Source" : "Plain / Source",
              "mode-source",
            ],
            ["Read", "mode-read"],
            ["Heading outline", "outline"],
          ]
        : [
            ["Formatted (Markdown)", "mode-live"],
            ["Plain / Source", "mode-source"],
          ]),
      ["Read-only", "read-only"],
      ["Status bar", "status-bar"],
      ["Zoom in", "zoom-in"],
      ["Zoom out", "zoom-out"],
      ["Actual size", "zoom-reset"],
      ["Full screen", "fullscreen"],
    ],
    Help: [
      ["About DEFT", "about"],
      ["Choose default apps", "default-apps"],
    ],
    recent: settings.recent.map((file) => [
      file.split(/[/\\]/).at(-1)!,
      `recent:${file}`,
    ]),
  };
  function dismiss(focus = true) {
    setShown(false);
    setPoint(null);
    if (focus) {
      const preferences = document.querySelector<HTMLButtonElement>(
        ".settings:not([hidden]) button",
      );
      if (preferences) preferences.focus();
      else if (current?.view) current.view.focus();
      else (recentTrigger.current || trigger.current)?.focus();
    }
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && shown) {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      }
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === "F10" ||
          (event.altKey && event.key.toLowerCase() === "f"))
      ) {
        event.preventDefault();
        if (shown) dismiss();
        else {
          setGroup(event.altKey ? "File" : "");
          setShown(true);
        }
      }
    };
    const context = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".document")) return;
      event.preventDefault();
      setGroup(current?.doc.kind === "markdown" ? "Format" : "Edit");
      setPoint({
        x: Math.min(event.clientX, innerWidth - 360),
        y: Math.min(event.clientY, innerHeight - 330),
      });
      setShown(true);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("contextmenu", context);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("contextmenu", context);
    };
  }, [shown, current]);
  useEffect(() => {
    if (!shown) return;
    list.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) dismiss(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [shown, group]);
  function run(action: string) {
    if (action === "recent") {
      setGroup("recent");
      return;
    }
    dismiss();
    if (action.startsWith("recent:")) void open([action.slice(7)]);
    else void command(action);
  }
  const disabled = (action: string) =>
    action.startsWith("format-") || action.startsWith("table-")
      ? !editable
      : [
          "save",
          "save-as",
          "export",
          "pdf",
          "print",
          "close",
          "read-only",
        ].includes(action) && !current;
  return (
    <div className="application-menu" ref={root}>
      {window.deft.platform !== "darwin" && (
        <button
          ref={trigger}
          aria-label="Application menu"
          title="Application menu (Alt+F / F10)"
          aria-haspopup="menu"
          aria-expanded={shown}
          onClick={() => {
            setGroup("");
            setPoint(null);
            setShown(!shown);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              d="M3 4.5h12M3 9h12M3 13.5h12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
      <button
        ref={recentTrigger}
        aria-label="Recent files"
        title="Open recent files"
        aria-haspopup="menu"
        aria-expanded={shown && group === "recent"}
        onClick={() => {
          setGroup("recent");
          setPoint(null);
          setShown(!shown || group !== "recent");
        }}
      >
        Recent
      </button>
      <div
        ref={list}
        className="application-popup"
        role="menu"
        aria-label={group || "Application"}
        hidden={!shown}
        inert={!shown}
        style={
          point ? { position: "fixed", left: point.x, top: point.y } : undefined
        }
        onKeyDown={(event) => {
          const buttons = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          ];
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
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
          if (event.key === "ArrowLeft" && group) {
            event.preventDefault();
            setGroup("");
          }
          if (event.key === "ArrowRight")
            (document.activeElement as HTMLButtonElement)?.click();
          if (event.key === "Tab") dismiss(false);
        }}
      >
        {group ? (
          <>
            <button role="menuitem" onClick={() => setGroup("")}>
              ‹ {group === "recent" ? "Recent Files" : group}
            </button>
            <div role="separator" />
            {groups[group].length ? (
              groups[group].map(([label, action]) => (
                <button
                  role="menuitem"
                  aria-label={label}
                  title={
                    action.startsWith("recent:") ? action.slice(7) : undefined
                  }
                  key={action}
                  disabled={disabled(action)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => run(action)}
                >
                  {action.startsWith("recent:") ? (
                    <span className="recent-file">
                      <span>{label}</span>
                      <small>{action.slice(7)}</small>
                    </span>
                  ) : (
                    label
                  )}
                  <span className="shortcut">
                    {label === "New tab"
                      ? shortcutLabel("new-text").replace("+N", "+T")
                      : shortcutLabel(
                          action === "mode-source" ? "toggle-source" : action,
                        )}
                  </span>
                  {(action === `mode-${current?.doc.mode}` ||
                    (action.startsWith("format-") &&
                      current?.formatActive(action.slice(7) as Format)) ||
                    (action === "status-bar" && settings.statusBar !== false) ||
                    (action === "read-only" && current?.doc.readOnly)) && (
                    <span aria-label="Selected">✓</span>
                  )}
                </button>
              ))
            ) : (
              <p>No recent files</p>
            )}
          </>
        ) : (
          <>
            {Object.keys(groups)
              .filter((name) => name !== "recent")
              .map((name) => (
                <button
                  role="menuitem"
                  aria-label={name}
                  aria-haspopup="menu"
                  key={name}
                  onClick={() => setGroup(name)}
                >
                  {name}
                  <span aria-hidden="true">›</span>
                </button>
              ))}
            <div role="separator" />
            <button
              role="menuitem"
              aria-label="Preferences…"
              onClick={() => run("settings")}
            >
              Preferences…{" "}
              <span className="shortcut">{shortcutLabel("settings")}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
