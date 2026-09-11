import React, { useEffect, useRef, useState, useMemo } from "react";
import { DocumentEditor } from "./editor";
import { renderMarkdown, exportDocument } from "./markdown";
import type { Document, Settings, Kind, Mode } from "./types";
const defaults: Settings = {
  appearance: "system",
  material: "glass",
  wrap: true,
  lines: false,
  fontSize: 16,
  reducedMotion: false,
  autosave: false,
  recent: [],
};
const kindOf = (doc: Document): Kind =>
  doc.kind || (/\.(md|markdown|mdown)$/i.test(doc.name) ? "markdown" : "text");
export function useWorkbench() {
  const [tabs, setTabs] = useState<DocumentEditor[]>([]),
    [active, setActive] = useState(""),
    [settings, setSettings] = useState(defaults),
    [panel, setPanel] = useState(false),
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
    saving = useRef(new Set<string>()),
    initialized = useRef(false),
    recoveryReady = useRef(false);
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
        list.map((tab: DocumentEditor) => ({ ...tab.doc, text: tab.doc.text })),
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
  async function newDoc(kind: Kind) {
    add([await window.deft.create(kind)]);
  }
  async function open(paths?: string[]) {
    add(await window.deft.open(paths));
  }
  async function save(tab = current, copy = false, utf8 = false) {
    if (!tab || saving.current.has(tab.doc.id)) return false;
    saving.current.add(tab.doc.id);
    setBusy(true);
    const text = tab.doc.text;
    try {
      const result = await window.deft.save(tab.doc.id, text, copy, utf8);
      if (!result) return false;
      tab.doc = {
        ...tab.doc,
        ...result,
        text: tab.doc.text,
        dirty: tab.doc.text !== text,
      };
      setNotice("Saved");
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
  async function close(tab = current) {
    if (!tab) return true;
    if (saving.current.has(tab.doc.id)) {
      setNotice("Wait for the save to finish.");
      return false;
    }
    if (tab.doc.dirty) {
      const answer = await window.deft.confirm("Save changes?", tab.doc.name, [
        "Cancel",
        "Discard",
        "Save",
      ]);
      if (answer === 0) return false;
      if (answer === 2 && !(await save(tab))) return false;
      if (answer === 2 && tab.doc.dirty) {
        setNotice("New edits arrived during the save. The tab remains open.");
        return false;
      }
    }
    const next = latest.current.tabs.filter(
      (item: DocumentEditor) => item !== tab,
    );
    await recovery(next);
    await window.deft.close(tab.doc.id);
    tab.unmount();
    latest.current.tabs = next;
    setTabs(next);
    if (latest.current.active === tab.doc.id)
      setActive(next.at(-1)?.doc.id || "");
    return true;
  }
  async function quit() {
    for (const tab of [...latest.current.tabs]) {
      if (tab.doc.dirty) {
        const answer = await window.deft.confirm(
          "Keep this draft for next time?",
          tab.doc.name,
          ["Cancel", "Keep draft", "Discard", "Save"],
        );
        if (answer === 0) return;
        if (answer === 2) {
          if (!(await closeDiscard(tab))) return;
        }
        if (answer === 3 && !(await save(tab))) return;
      }
    }
    await recovery();
    await window.deft.close(null, true);
  }
  async function closeDiscard(tab: DocumentEditor) {
    const next = latest.current.tabs.filter(
      (item: DocumentEditor) => item !== tab,
    );
    await recovery(next);
    await window.deft.close(tab.doc.id);
    latest.current.tabs = next;
    setTabs(next);
    return true;
  }
  async function configure(value: Partial<Settings>) {
    const next = { ...latest.current.settings, ...value };
    setSettings(next);
    latest.current.settings = next;
    for (const tab of latest.current.tabs) tab.configure(next);
    await window.deft.settings(value);
  }
  async function command(action: string) {
    const tab = latest.current.current;
    try {
      switch (action) {
        case "new-text":
          return newDoc("text");
        case "new-markdown":
          return newDoc("markdown");
        case "open":
        case "pending":
          return open();
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
        latest.current.settings = { ...defaults, ...data.settings };
        setSettings(latest.current.settings);
        add(data.docs);
        recoveryReady.current = true;
        if (data.pending) await open();
      })
      .catch(report);
    return window.deft.onAction((name: string) => void command(name));
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        setPanel(false);
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const mapped: Record<string, string> = {
        f: "find",
        l: "line",
        s: event.shiftKey ? "save-as" : "save",
        o: "open",
        n: event.shiftKey ? "new-markdown" : "new-text",
        w: "close",
        p: "print",
        ",": "settings",
      };
      if (mapped[key]) {
        event.preventDefault();
        void command(mapped[key]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
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
  }, [revision, tabs]);
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
  };
}
