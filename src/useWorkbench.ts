import React, { useEffect, useRef, useState, useMemo } from "react";
import { DocumentEditor } from "./editor";
import { renderMarkdown, exportDocument } from "./markdown";
import type { Document, Settings, Kind, Mode } from "./types";
import type { Format } from "./formatting";
import { preferences } from "./preferences";
import { shortcutFor } from "../desktop/shortcuts.cjs";
const defaults = preferences();
const kindOf = (doc: Document): Kind =>
  doc.kind || (/\.(md|markdown|mdown)$/i.test(doc.name) ? "markdown" : "text");
export function useWorkbench() {
  const [tabs, setTabs] = useState<DocumentEditor[]>([]),
    [active, setActive] = useState(""),
    [settings, setSettings] = useState(defaults),
    [panel, setPanel] = useState(false),
    [linkEditor, setLinkEditor] = useState<DocumentEditor | null>(null),
    [outline, setOutline] = useState(false),
    [notice, setNotice] = useState(""),
    [html, setHtml] = useState(""),
    [revision, refresh] = useState(0),
    [busy, setBusy] = useState(false);
  const host = useRef<HTMLDivElement>(null),
    latest = useRef<{
      tabs: DocumentEditor[];
      active: string;
      settings: Settings;
      current?: DocumentEditor;
    }>({ tabs: [], active: "", settings: defaults }),
    saving = useRef(new Map<string, Promise<boolean>>()),
    initialized = useRef(false),
    recoveryReady = useRef(false),
    closing = useRef(false),
    transitions = useRef(Promise.resolve());
  const current = tabs.find((tab) => tab.doc.id === active);
  const update = () => refresh((n) => n + 1);
  latest.current = { tabs, active, settings, current };
  const report = (error: unknown) =>
    setNotice(
      String(error instanceof Error ? error.message : error).replace(
        /^Error invoking remote method '[^']+': Error: /,
        "",
      ),
    );
  async function recovery(list = latest.current.tabs) {
    if (recoveryReady.current)
      await window.deft.recover(
        latest.current.settings.restoreSession === false
          ? []
          : list.map((tab: DocumentEditor) =>
              tab.snapshot(latest.current.active),
            ),
      );
  }
  function add(docs: Document[]) {
    const next = [...latest.current.tabs];
    for (const doc of docs) {
      const found = next.find(
        (tab) =>
          tab.doc.id === doc.id || (doc.path && tab.doc.path === doc.path),
      );
      if (found) {
        setActive(found.doc.id);
        continue;
      }
      doc.kind = kindOf(doc);
      doc.mode =
        doc.mode ||
        (doc.kind === "markdown" && doc.text.length < 500_000
          ? "live"
          : "source");
      if (doc.text.length >= 500_000) doc.mode = "source";
      next.push(new DocumentEditor(doc, latest.current.settings, update));
      setActive(doc.id);
    }
    latest.current.tabs = next;
    setTabs(next);
    return next;
  }
  function reorder(id: string, target: string) {
    if (closing.current) return;
    const next = [...latest.current.tabs];
    const from = next.findIndex((tab) => tab.doc.id === id);
    const to = next.findIndex((tab) => tab.doc.id === target);
    if (from < 0 || to < 0 || from === to) return;
    next.splice(to, 0, next.splice(from, 1)[0]);
    latest.current.tabs = next;
    setTabs(next);
  }
  async function createDoc(kind: Kind) {
    add([await window.deft.create(kind)]);
  }
  function newDoc(kind: Kind) {
    if (closing.current) return;
    return transition(() => createDoc(kind));
  }
  async function open(paths?: string[]) {
    if (closing.current) return;
    return transition(async () => {
      add(await window.deft.open(paths));
      await refreshRecent();
    });
  }
  async function refreshRecent() {
    const { recent } = await window.deft.settings();
    const next = { ...latest.current.settings, recent };
    latest.current.settings = next;
    setSettings(next);
  }
  async function save(tab = current, copy = false, utf8 = false) {
    if (!tab) return false;
    const previous = saving.current.get(tab.doc.id);
    if (previous) {
      if (!(await previous) || !latest.current.tabs.includes(tab)) return false;
      return save(tab, copy, utf8);
    }
    setBusy(true);
    const operation = Promise.resolve().then(() =>
      performSave(tab, copy, utf8),
    );
    saving.current.set(tab.doc.id, operation);
    return operation;
  }
  async function performSave(
    tab: DocumentEditor,
    copy: boolean,
    utf8: boolean,
  ) {
    const text = tab.doc.text;
    try {
      const result = await window.deft.save(tab.doc.id, text, copy, utf8);
      if (!result) return false;
      tab.doc = {
        ...tab.doc,
        ...result,
        kind: tab.doc.kind,
        mode: tab.doc.mode,
        formatted: tab.doc.formatted,
        text: tab.doc.text,
        dirty: tab.doc.text !== text,
      };
      setNotice("");
      update();
      await recovery();
      return true;
    } catch (error) {
      report(error);
      return false;
    } finally {
      saving.current.delete(tab.doc.id);
      setBusy(saving.current.size > 0);
    }
  }
  function transition(work: () => Promise<void>) {
    const result = transitions.current.then(work);
    transitions.current = result.catch(report);
    return result;
  }
  function close(tab = latest.current.current) {
    return transition(async () => {
      if (!tab || !latest.current.tabs.includes(tab)) return;
      if (saving.current.has(tab.doc.id)) {
        setNotice("Wait for the save to finish.");
        return;
      }
      await window.deft.close(tab.doc.id);
      const next = latest.current.tabs.filter((item) => item !== tab);
      tab.unmount();
      latest.current.tabs = next;
      setTabs(next);
      if (latest.current.active === tab.doc.id) {
        latest.current.active = next.at(-1)?.doc.id || "";
        setActive(latest.current.active);
      }
      await recovery();
    });
  }
  function quit() {
    if (closing.current) return;
    closing.current = true;
    return transition(async () => {
      const locked = [...latest.current.tabs];
      document.body.inert = true;
      for (const tab of locked) tab.lockForQuit(true);
      try {
        if (!recoveryReady.current)
          throw new Error(
            "Recovery is unavailable. Keep this window open and save your work before quitting.",
          );
        // Snapshot after every previously requested close, with the latest editor text.
        await recovery();
        await window.deft.close(null, true);
      } catch (error) {
        document.body.inert = false;
        for (const tab of locked) tab.lockForQuit(false);
        closing.current = false;
        throw error;
      }
    });
  }
  async function configure(value: Partial<Settings>) {
    const next = { ...latest.current.settings, ...value };
    setSettings(next);
    latest.current.settings = next;
    for (const tab of latest.current.tabs) tab.configure(next);
    await window.deft.settings(value);
  }
  async function command(action: string) {
    if (closing.current) return;
    const tab = latest.current.current;
    if (
      (action.startsWith("format-") || action.startsWith("table-")) &&
      document.activeElement?.matches("input, textarea, select")
    )
      return;
    try {
      if (action.startsWith("recent:")) return open([action.slice(7)]);
      if (
        action.startsWith("edit-") ||
        action.startsWith("zoom-") ||
        ["about", "default-apps", "fullscreen"].includes(action)
      )
        return window.deft.nativeCommand(action);
      if (action === "toggle-source" && tab)
        action = tab.doc.mode === "source" ? "mode-live" : "mode-source";
      if (action.startsWith("mode-") && tab) {
        const value = action.slice(5) as Mode;
        if (tab.doc.text.length >= 500_000 && value !== "source") {
          setNotice(
            "Rich views are limited to documents under 500,000 characters.",
          );
          return;
        }
        if (value !== "source" && !tab.formatted) tab.doc.formatted = true;
        tab.doc.mode = value;
        tab.configure(latest.current.settings);
        update();
        return;
      }
      if (
        (action.startsWith("format-") || action.startsWith("table-")) &&
        tab
      ) {
        if (tab.doc.readOnly || tab.doc.mode === "read") {
          setNotice(
            "Formatting is unavailable in a read-only view. Enable editing first.",
          );
          return;
        }
        if (!tab.formatted) {
          if (tab.doc.text.length >= 500_000) {
            setNotice(
              "Formatted editing is limited to documents under 500,000 characters.",
            );
            return;
          }
          tab.doc.formatted = true;
          tab.doc.mode = "live";
          tab.configure(latest.current.settings);
          setNotice(
            "Formatting inserts Markdown characters. The filename stays the same; these characters can change a script or config's meaning.",
          );
          update();
        }
      }
      if (action === "status-bar")
        return configure({
          statusBar: latest.current.settings.statusBar === false,
        });
      if (action === "outline") {
        setOutline((value) => !value);
        return;
      }
      if (action === "read-only" && tab) {
        tab.doc.readOnly = !tab.doc.readOnly;
        tab.configure(latest.current.settings);
        update();
        return;
      }
      if (action.startsWith("table-") && tab?.formatted) {
        if (action === "table-insert")
          tab.insert("\n| Column | Column |\n| --- | --- |\n| Text | Text |\n");
        else tab.table(action.slice(6) as import("./table").TableAction);
        return;
      }
      if (
        action.startsWith("format-") &&
        tab?.formatted &&
        !tab.doc.readOnly &&
        tab.doc.mode !== "read"
      ) {
        const format = action.slice(7) as Format;
        if (format === "link") setLinkEditor(tab);
        else tab.format(format);
        return;
      }
      switch (action) {
        case "new-text":
          return newDoc("text");
        case "next-tab":
        case "previous-tab": {
          const list = latest.current.tabs;
          const index = list.findIndex(
            (item) => item.doc.id === latest.current.active,
          );
          const next =
            list[
              (index + (action === "next-tab" ? 1 : list.length - 1)) %
                list.length
            ];
          if (next) setActive(next.doc.id);
          return;
        }
        case "new-markdown":
          return newDoc("markdown");
        case "open":
          return open();
        case "pending":
          return transition(async () => {
            add(await window.deft.pending());
            await refreshRecent();
          });
        case "save":
          return save(tab);
        case "save-as":
          return save(tab, true);
        case "close":
          return close(tab);
        case "quit":
          return quit();
        case "settings":
          return setPanel((value) => !value);
        case "find":
        case "replace":
        case "line":
          return tab?.command(action);
        case "export":
        case "print":
        case "pdf":
          if (tab) await window.deft[action](await exportDocument(tab.doc));
          break;
      }
    } catch (error) {
      report(error);
    }
  }
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    window.deft
      .init()
      .then(async (data: any) => {
        latest.current.settings = preferences(data.settings);
        setSettings(latest.current.settings);
        add(data.docs);
        const selected = data.docs.find((doc: Document) => doc.active);
        if (selected) setActive(selected.id);
        recoveryReady.current = true;
        if (data.pending) {
          add(await window.deft.pending());
          await refreshRecent();
        }
        if (!latest.current.tabs.length) await newDoc("text");
      })
      .catch(report);
    return window.deft.onAction((name: string) => void command(name));
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const action = shortcutFor(
        {
          type: "keyDown",
          key: event.key,
          code: event.code,
          control: event.ctrlKey,
          meta: event.metaKey,
          alt: event.altKey,
          shift: event.shiftKey,
          isComposing: event.isComposing,
          altGraph: event.getModifierState("AltGraph"),
        },
        window.deft.platform,
      );
      if (action) {
        event.preventDefault();
        void command(action);
      }
    };
    window.addEventListener("keydown", handler, true);
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !document.querySelector(
          ".application-popup:not([hidden]), .format-menu:not([hidden]), .font-picker:not([hidden]), .link-editor",
        )
      )
        setPanel(false);
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", handler, true);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (host.current && current) {
      current.mount(host.current);
      return () => current.unmount();
    }
  }, [active]);
  useEffect(() => {
    let canceled = false;
    if (current?.doc.mode === "read")
      renderMarkdown(current.doc.text, current.doc)
        .then((value) => {
          if (!canceled) setHtml(value);
        })
        .catch(report);
    return () => {
      canceled = true;
    };
  }, [active, current?.doc.mode, revision]);
  useEffect(() => {
    if (!initialized.current) return;
    const timer = setTimeout(() => recovery().catch(report), 500);
    return () => clearTimeout(timer);
  }, [revision, tabs, active]);
  useEffect(() => {
    let polling = false;
    async function reload(tab: DocumentEditor) {
      const before = tab.doc.text;
      const candidate = await window.deft.reload(tab.doc.id);
      if (tab.doc.text !== before) {
        setNotice(
          "New edits were kept. The external file has not been accepted.",
        );
        return;
      }
      tab.reload({ ...tab.doc, ...candidate });
      await window.deft.acceptReload(tab.doc.id, candidate.fingerprint);
      update();
    }
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        for (const tab of latest.current.tabs) {
          if (!tab.doc.path || saving.current.has(tab.doc.id)) continue;
          const result = await window.deft.check(tab.doc.id);
          if (!result.changed) continue;
          if (!tab.doc.dirty && !result.error) {
            await reload(tab);
            continue;
          }
          if ((tab as any).conflict === JSON.stringify(result)) continue;
          (tab as any).conflict = JSON.stringify(result);
          const answer = await window.deft.confirm(
            "File changed outside DEFT",
            result.error || tab.doc.name,
            ["Keep editing", "Reload from disk", "Save a copy"],
          );
          if (answer === 1) {
            await reload(tab);
          }
          if (answer === 2) await save(tab, true);
        }
      } catch (error) {
        report(error);
      } finally {
        polling = false;
      }
    }, 2500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (latest.current.settings.autosave)
        for (const tab of latest.current.tabs)
          if (tab.doc.path && tab.doc.dirty && !tab.doc.readOnly)
            void save(tab);
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  async function paste(event: React.ClipboardEvent) {
    const file = [...event.clipboardData.files].find(
      (file) => file.type === "image/png",
    );
    if (
      !file ||
      !current ||
      current.doc.kind !== "markdown" ||
      current.doc.readOnly ||
      current.doc.mode === "read"
    )
      return;
    event.preventDefault();
    await importImage(file);
  }
  async function drop(event: React.DragEvent) {
    event.preventDefault();
    const files = [...event.dataTransfer.files];
    const png =
      files.length === 1 && files[0].type === "image/png"
        ? files[0]
        : undefined;
    if (png && current?.doc.kind === "markdown" && !current.doc.readOnly) {
      await importImage(png);
    } else {
      try {
        add(await window.deft.dropped(files));
      } catch (error) {
        report(error);
      }
    }
  }
  async function importImage(file: File) {
    if (!current || current.doc.readOnly || current.doc.mode === "read") return;
    try {
      if (!current.doc.path && !(await save(current))) return;
      const answer = await window.deft.confirm(
        "Save image beside this document?",
        "The PNG will be stored in the assets folder.",
        ["Cancel", "Add image"],
      );
      if (answer !== 1) return;
      const relative = await window.deft.image(
        current.doc.id,
        Array.from(new Uint8Array(await file.arrayBuffer())),
      );
      current.insert(`![Image](${relative})`);
    } catch (error) {
      report(error);
    }
  }
  function mode(value: Mode) {
    if (!current) return;
    if (current.doc.text.length >= 500_000 && value !== "source") {
      setNotice(
        "Rich views are limited to documents under 500,000 characters. Source editing remains available.",
      );
      return;
    }
    current.doc.mode = value;
    current.configure(settings);
    update();
  }
  const line = current?.state.doc.lineAt(current.state.selection.main.head);
  const endings = useMemo(
    () => current?.doc.text.match(/\r\n|\r|\n/g) || [],
    [current?.doc.text],
  );
  const unique = new Set(endings);
  const headings =
    current && outline
      ? [...current.doc.text.matchAll(/^(#{1,6}) (.+)$/gm)]
      : [];
  return {
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
  };
}
