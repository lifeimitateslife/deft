import React from "react";
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
    update,
    report,
  } = useWorkbench();
  return (
    <main
      data-appearance={settings.appearance}
      data-material={settings.material}
      data-reduced-motion={settings.reducedMotion}
    >
      <header>
        <div className="tools">
          <button
            title="Open file (Ctrl/Cmd+O)"
            onClick={() => void command("open")}
          >
            Open
          </button>
          <button title="New text document" onClick={() => void newDoc("text")}>
            New text
          </button>
          <button
            title="New Markdown document"
            onClick={() => void newDoc("markdown")}
          >
            New Markdown
          </button>
          <span className="divider" />
          <button disabled={!current || busy} onClick={() => void save()}>
            Save
          </button>
          <button disabled={!current} onClick={() => void save(current, true)}>
            Save as
          </button>
        </div>
        <button
          aria-label="Settings"
          aria-expanded={panel}
          onClick={() => setPanel(!panel)}
        >
          ⚙
        </button>
      </header>
      <nav className="tabs" aria-label="Open documents">
        {tabs.map((tab) => (
          <div
            key={tab.doc.id}
            className={`tab ${tab === current ? "active" : ""}`}
          >
            <button
              aria-pressed={tab === current}
              title={tab.doc.path || "Unsaved document"}
              onClick={() => setActive(tab.doc.id)}
            >
              {tab.doc.dirty ? (
                <span className="dirty" aria-label="Unsaved changes">
                  ●
                </span>
              ) : (
                <span className="filemark">
                  {tab.doc.kind === "markdown" ? "M" : "T"}
                </span>
              )}
              {tab.doc.name}
            </button>
            <button
              aria-label={`Close ${tab.doc.name}`}
              onClick={() => void close(tab)}
            >
              ×
            </button>
          </div>
        ))}
      </nav>
      {current ? (
        <>
          <div className="document-toolbar">
            <div>
              {current.doc.kind === "markdown" && (
                <>
                  <button
                    aria-label="Toggle heading outline"
                    aria-expanded={outline}
                    onClick={() => setOutline(!outline)}
                  >
                    ☰
                  </button>
                  <button
                    title="Bold"
                    disabled={current.doc.readOnly}
                    onClick={() => current.insert("**", "**")}
                  >
                    <b>B</b>
                  </button>
                  <button
                    title="Italic"
                    disabled={current.doc.readOnly}
                    onClick={() => current.insert("*", "*")}
                  >
                    <i>I</i>
                  </button>
                  <button
                    title="Insert link"
                    disabled={current.doc.readOnly}
                    onClick={() =>
                      current.insert("[", "](https://example.com)")
                    }
                  >
                    Link
                  </button>
                  <button
                    title="Insert task"
                    disabled={current.doc.readOnly}
                    onClick={() => current.insert("- [ ] ")}
                  >
                    Task
                  </button>
                  <button
                    title="Insert table"
                    disabled={current.doc.readOnly}
                    onClick={() =>
                      current.insert(
                        "\n| Column | Column |\n| --- | --- |\n| Text | Text |\n",
                      )
                    }
                  >
                    Table
                  </button>
                  <button
                    title="Add a row to the table at the caret"
                    disabled={current.doc.readOnly || !current.selectedTable}
                    onClick={() => current.table("row")}
                  >
                    + Row
                  </button>
                  <button
                    title="Add a column to the table at the caret"
                    disabled={current.doc.readOnly || !current.selectedTable}
                    onClick={() => current.table("column")}
                  >
                    + Column
                  </button>
                </>
              )}
            </div>
            <div className="view-switch" aria-label="Document view">
              {(current.doc.kind === "markdown"
                ? ["live", "source", "read"]
                : ["source"]
              ).map((value) => (
                <button
                  key={value}
                  aria-pressed={current.doc.mode === value}
                  onClick={() => mode(value as Mode)}
                >
                  {value === "source" && current.doc.kind === "text"
                    ? "Text"
                    : value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
            <button
              aria-pressed={current.doc.readOnly}
              onClick={() => {
                current.doc.readOnly = !current.doc.readOnly;
                current.configure(settings);
                update();
              }}
            >
              {current.doc.readOnly ? "Read-only" : "Editable"}
            </button>
          </div>
          <div className="workspace">
            {outline && current.doc.kind === "markdown" && (
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
              className={`document ${current.doc.kind} ${current.doc.mode}`}
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
          <footer>
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
          <div className="brand-mark">D</div>
          <h1>DEFT</h1>
          <p>A little room to think.</p>
          <div>
            <button className="primary" onClick={() => void newDoc("markdown")}>
              New Markdown
            </button>
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
      {panel && (
        <section className="settings" aria-label="Settings">
          <div className="settings-title">
            <h2>Settings</h2>
            <button aria-label="Close settings" onClick={() => setPanel(false)}>
              ×
            </button>
          </div>
          <label>
            Appearance
            <select
              aria-label="Appearance"
              value={settings.appearance}
              onChange={(event) =>
                void configure({ appearance: event.target.value as any })
              }
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Material
            <select
              aria-label="Material"
              value={settings.material}
              onChange={(event) =>
                void configure({ material: event.target.value as any })
              }
            >
              <option value="glass">Glass</option>
              <option value="solid">Solid</option>
            </select>
          </label>
          {(["wrap", "lines", "reducedMotion", "autosave"] as const).map(
            (key, index) => (
              <label key={key}>
                {
                  [
                    "Word wrap",
                    "Line numbers",
                    "Reduce motion",
                    "Autosave named files",
                  ][index]
                }
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(event) =>
                    void configure({ [key]: event.target.checked })
                  }
                />
              </label>
            ),
          )}
          <label>
            Text size
            <input
              aria-label="Text size"
              type="number"
              min="11"
              max="32"
              value={settings.fontSize}
              onChange={(event) =>
                void configure({
                  fontSize: Math.max(
                    11,
                    Math.min(32, Number(event.target.value)),
                  ),
                })
              }
            />
          </label>
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
          <button
            onClick={async () => {
              const result = await window.deft.confirm(
                "Clear recovery snapshots?",
                "Open documents remain in memory and new recovery snapshots will be created as you edit.",
                ["Cancel", "Clear"],
              );
              if (result === 1) await window.deft.recover([]);
            }}
          >
            Clear recovery
          </button>
          <p>
            Draft recovery is on. Remote images are blocked. Local images stay
            inside the document folder.
          </p>
        </section>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
