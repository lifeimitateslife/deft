import React, { useEffect, useRef, useState } from "react";
import { TabStrip } from "./TabStrip";
import { ApplicationMenu } from "./ApplicationMenu";
import { FormattingToolbar, LinkEditor } from "./FormattingToolbar";
import { UpdateNotice } from "./UpdateNotice";
import { Appearance } from "./Appearance";
import brandIcon from "../assets/icon.png";
import { fontStack, defaults } from "./preferences";
import { createRoot } from "react-dom/client";
import { useWorkbench } from "./useWorkbench";
import type { Mode } from "./types";
import "./style.css";
import "katex/dist/katex.min.css";
function App() {
  const {
    tabs,
    active,
    current,
    settings,
    panel,
    setPanel,
    linkEditor,
    setLinkEditor,
    outline,
    setOutline,
    notice,
    setNotice,
    html,
    busy,
    host,
    add,
    newDoc,
    open,
    save,
    close,
    configure,
    command,
    paste,
    drop,
    mode,
    line,
    endings,
    unique,
    headings,
    setActive,
    reorder,
    update,
    report,
  } = useWorkbench();
  const settingsPanel = useRef<HTMLElement>(null);
  const preferencesOpener = useRef<HTMLElement | null>(null);
  const preferencesWasOpen = useRef(false);

  const [settingsVisit, setSettingsVisit] = useState(0);
  useEffect(() => {
    if (!panel) {
      if (
        preferencesWasOpen.current &&
        (settingsPanel.current?.contains(document.activeElement) ||
          document.activeElement?.closest(".font-picker") ||
          document.activeElement === document.body)
      )
        preferencesOpener.current?.focus({ preventScroll: true });
      preferencesWasOpen.current = false;
      return;
    }
    preferencesWasOpen.current = true;
    preferencesOpener.current = document.activeElement as HTMLElement;
    setSettingsVisit((visit) => visit + 1);
    settingsPanel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if ((target as HTMLElement).closest?.(".font-picker")) return;
      if (
        !settingsPanel.current?.contains(target) &&
        !document.querySelector(".application-menu")?.contains(target)
      ) {
        setPanel(false);
        if (settingsPanel.current?.contains(document.activeElement))
          preferencesOpener.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [panel]);
  const dismissSettings = () => {
    setPanel(false);
    preferencesOpener.current?.focus({ preventScroll: true });
  };
  const [material, setMaterial] = useState({
    enabled: false,
    reason: "Checking system backdrop…",
  });
  useEffect(() => {
    const refreshMaterial = () =>
      window.deft.material(settings.material).then(setMaterial).catch(report);
    void refreshMaterial();
    return window.deft.onAction((action: string) => {
      if (action === "material-updated") void refreshMaterial();
    });
  }, [
    settings.material,
    settings.backgroundBlur,
    settings.backgroundBlurStrength,
  ]);
  const custom = settings.appearance === "custom" ? settings.custom : undefined;
  const theme = {
    ...(custom
      ? {
          "--chrome": custom.chrome,
          "--paper": custom.paper,
          "--text": custom.text,
          "--accent": custom.accent,
        }
      : {}),
    "--glass-opacity": `${settings.glassOpacity ?? defaults.glassOpacity}%`,
    "--body-font": fontStack(settings.fontFamily),
    "--code-font": fontStack(settings.codeFontFamily, true),
    "--body-size": `${settings.fontSize}px`,
  } as React.CSSProperties;
  return (
    <main
      style={theme}
      data-glass={material.enabled}
      data-appearance={settings.appearance}
      data-material={settings.material}
      data-reduced-motion={settings.reducedMotion}
    >
      <div className="navigation">
        <ApplicationMenu
          current={current}
          settings={settings}
          command={command}
          open={open}
        />
        <TabStrip
          tabs={tabs}
          current={current}
          select={setActive}
          close={close}
          reorder={reorder}
        />
        <button
          className="new-tab"
          aria-label="New text tab"
          title="New text tab (Ctrl/Cmd+T)"
          onClick={() => void command("new-text")}
        >
          +
        </button>
      </div>
      {current ? (
        <>
          {current.doc.readOnly && (
            <div className="readonly-notice" role="status">
              Read-only{" "}
              <button onClick={() => void command("read-only")}>
                Enable editing
              </button>
            </div>
          )}
          <ContextualFormat
            editor={current}
            command={command}
            hidden={panel || !!linkEditor}
          />
          <div className="workspace">
            {outline && current.formatted && (
              <aside aria-label="Heading outline">
                <div className="aside-label">On this page</div>
                {headings.map((heading, index) => (
                  <button
                    key={index}
                    style={{ paddingLeft: 12 + heading[1].length * 8 }}
                    onClick={() => {
                      const before = current.doc.text
                        .slice(0, heading.index)
                        .replace(/\r\n?/g, "\n").length;
                      current.dispatch({
                        selection: { anchor: before },
                        scrollIntoView: true,
                      });
                      current.view?.focus();
                    }}
                  >
                    {heading[2]}
                  </button>
                ))}
              </aside>
            )}
            <div
              className={`document ${current.formatted ? "markdown" : current.doc.kind} ${current.doc.mode}`}
              onPaste={paste}
              onDragOver={(event) => event.preventDefault()}
              onDrop={drop}
            >
              <div
                ref={host}
                className="editor-host"
                style={{
                  display: current.doc.mode === "read" ? "none" : undefined,
                }}
              />
              {current.doc.mode === "read" && (
                <article
                  onClick={(event) => {
                    const anchor = (event.target as HTMLElement).closest("a");
                    if (anchor) {
                      event.preventDefault();
                      const href = anchor.getAttribute("href");
                      if (href)
                        window.deft
                          .link(current.doc.id, href)
                          .then(add)
                          .catch(report);
                    }
                  }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )}
            </div>
          </div>
          <footer hidden={settings.statusBar === false}>
            <span>
              {busy
                ? "Saving…"
                : current.doc.dirty
                  ? "Unsaved changes"
                  : "Saved"}
              {current.doc.path ? "" : " draft"}
            </span>
            <button onClick={() => current.command("line")}>
              Ln {line?.number || 1}, Col{" "}
              {line ? current.state.selection.main.head - line.from + 1 : 1}
            </button>
            <span>
              {current.doc.encoding.toUpperCase()}
              {current.doc.bom ? " BOM" : ""}
            </span>
            <span>
              {unique.size > 1
                ? "Mixed endings"
                : endings[0] === "\r\n"
                  ? "CRLF"
                  : endings[0] === "\r"
                    ? "CR"
                    : "LF"}
            </span>
            <span>{current.doc.text.length.toLocaleString()} characters</span>
            {current.formatted && (
              <span title="Formatting is stored as portable Markdown characters">
                {current.doc.mode}
                {current.doc.kind === "text" ? " · Markdown formatting" : ""}
              </span>
            )}
            <button onClick={() => void window.deft.reveal(current.doc.id)}>
              Reveal file
            </button>
          </footer>
        </>
      ) : (
        <section
          className="empty"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            window.deft
              .dropped([...event.dataTransfer.files])
              .then(add)
              .catch(report);
          }}
        >
          <img className="brand-mark" src={brandIcon} alt="DEFT logo" />
          <h1>DEFT</h1>
          <p>A little room to think.</p>
          <div>
            <button className="primary" onClick={() => void newDoc("markdown")}>
              New Markdown
            </button>
            <button onClick={() => void newDoc("text")}>New Text</button>
            <button onClick={() => void open()}>Open a file</button>
          </div>
          <p className="hint">Or drop a text file here.</p>
          {settings.recent.length > 0 && (
            <div className="recents">
              <h2>Recent files</h2>
              {settings.recent.map((file) => (
                <button
                  key={file}
                  title={file}
                  onClick={() => void open([file])}
                >
                  {file.split(/[/\\]/).at(-1)}
                </button>
              ))}
            </div>
          )}
          <small>LIFE IMITATES LIFE</small>
        </section>
      )}
      {linkEditor && (
        <LinkEditor
          href={linkEditor.link}
          cancel={() => {
            setLinkEditor(null);
            linkEditor.view?.focus();
          }}
          apply={(href) => {
            linkEditor.format("link", href);
            setLinkEditor(null);
          }}
        />
      )}
      <UpdateNotice hidden={!!notice || panel || !!linkEditor} />
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      <section
        ref={settingsPanel}
        id="settings-panel"
        className="settings"
        aria-label="Preferences"
        hidden={!panel}
        inert={!panel}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            dismissSettings();
          }
        }}
      >
        <div className="settings-title">
          <h2>Preferences</h2>
          <button aria-label="Close Preferences" onClick={dismissSettings}>
            ×
          </button>
        </div>
        <div className="preferences-brand">
          <img
            src={brandIcon}
            width="52"
            height="52"
            alt="DEFT document icon"
          />
          <div>
            <strong>DEFT</strong>
            <small>LIFE IMITATES LIFE</small>
          </div>
        </div>
        <Appearance
          visible={panel}
          key={settingsVisit}
          settings={settings}
          configure={configure}
          material={material}
        />
        <h3>Editing</h3>
        {(["wrap", "lines", "autosave", "restoreSession"] as const).map(
          (key, index) => (
            <label key={key}>
              {
                [
                  "Word wrap",
                  "Line numbers",
                  "Autosave named files",
                  "Restore previous session",
                ][index]
              }
              <input
                type="checkbox"
                checked={settings[key] !== false}
                onChange={(event) =>
                  void configure({ [key]: event.target.checked })
                }
              />
            </label>
          ),
        )}
        <p>
          Unfinished tabs reopen without choosing a file name. Closing a tab
          discards its unsaved changes. Named-file autosave is separate.
        </p>
        <button disabled={!current} onClick={() => void command("export")}>
          Export HTML
        </button>
        <button disabled={!current} onClick={() => void command("print")}>
          Print
        </button>
        <button disabled={!current} onClick={() => void command("pdf")}>
          Save as PDF
        </button>
        <button
          disabled={!current}
          onClick={() => void save(current, true, true)}
        >
          Save a UTF-8 copy
        </button>
        <p>
          Recovery is written after a short pause; a crash may lose the last
          half-second of typing. Remote images are blocked. Local images stay
          inside the document folder.
        </p>
      </section>
    </main>
  );
}
function ContextualFormat({
  editor,
  command,
  hidden,
}: {
  editor: import("./editor").DocumentEditor;
  command: (name: string) => unknown;
  hidden: boolean;
}) {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  useEffect(() => {
    const updatePosition = () => {
      if (
        hidden ||
        !editor.formatted ||
        editor.doc.mode !== "live" ||
        editor.doc.readOnly ||
        editor.state.selection.main.empty ||
        !editor.view
      ) {
        setPosition(null);
        return;
      }
      const caret = editor.view.coordsAtPos(editor.state.selection.main.from);
      if (!caret) {
        setPosition(null);
        return;
      }
      setPosition({
        top: Math.max(44, caret.top - 40),
        left: Math.max(8, Math.min(innerWidth - 300, caret.left)),
      });
    };
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    return () => window.removeEventListener("scroll", updatePosition, true);
  }, [editor, editor.state, hidden]);
  if (!position) return null;
  return (
    <div className="contextual-format" style={position}>
      <FormattingToolbar editor={editor} command={command} />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
