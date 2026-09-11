import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fontStack } from "./preferences";
let fontCache: string[] | undefined;
export function FontPicker({
  open,
  selected,
  code,
  close,
  apply,
}: {
  open: boolean;
  selected: string;
  code: boolean;
  close: () => void;
  apply: (font: string) => Promise<void>;
}) {
  const [fonts, setFonts] = useState(fontCache);
  const [search, setSearch] = useState("");
  const [candidate, setCandidate] = useState(selected);
  const [status, setStatus] = useState("");
  const shell = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const visit = useRef(0);
  const closeRef = useRef(close);
  closeRef.current = close;
  const [saving, setSaving] = useState(false);
  const choices = ["", ...(fonts || [])].filter((font) =>
    (font || "System default")
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  useEffect(() => {
    if (!open) return;
    const token = ++visit.current;
    opener.current = document.activeElement as HTMLElement;
    setSearch("");
    setCandidate(selected);
    setSaving(false);
    const preferences = document.querySelector<HTMLElement>(".settings");
    if (preferences) preferences.inert = true;
    input.current?.focus();
    if (!fontCache) {
      setStatus("Loading installed fonts…");
      Promise.resolve()
        .then(() => (window as any).queryLocalFonts())
        .then((result: { family: string }[]) => {
          fontCache = [...new Set(result.map((font) => font.family))].sort(
            (a, b) => a.localeCompare(b),
          );
          if (token === visit.current) {
            setFonts(fontCache);
            setStatus(
              `${fontCache.length} installed families. Font files stay on this computer.`,
            );
          }
        })
        .catch(() => {
          if (token === visit.current)
            setStatus(
              "Installed fonts could not be listed. System default remains available.",
            );
        });
    } else {
      setFonts(fontCache);
      setStatus(
        `${fontCache.length} installed families. Font files stay on this computer.`,
      );
    }
    const outside = (event: PointerEvent) => {
      if (!shell.current?.contains(event.target as Node)) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener("pointerdown", outside, true);
    return () => {
      ++visit.current;
      document.removeEventListener("pointerdown", outside, true);
      if (preferences) preferences.inert = preferences.hasAttribute("hidden");
      if (
        opener.current?.isConnected &&
        !opener.current.closest("[hidden], [inert]")
      )
        opener.current.focus({ preventScroll: true });
    };
  }, [open]);
  async function confirm(font: string) {
    if (saving) return;
    const token = visit.current;
    setSaving(true);
    try {
      await apply(font);
      if (token === visit.current) closeRef.current();
    } catch {
      if (token === visit.current) {
        setSaving(false);
        setStatus("The font could not be saved. Please try again.");
      }
    }
  }
  function navigate(index: number) {
    if (!choices.length) return;
    const font = choices[(index + choices.length) % choices.length];
    setCandidate(font);
    const items =
      shell.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    const button = items?.[(index + choices.length) % choices.length];
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: "nearest" });
  }
  const panel = (
    <div
      ref={shell}
      role="dialog"
      aria-label="Installed fonts"
      aria-modal="true"
      className="font-picker"
      hidden={!open}
      inert={!open}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          navigate(
            choices.indexOf(candidate) + (event.key === "ArrowDown" ? 1 : -1),
          );
        } else if (event.key === "Enter") {
          if (event.target === input.current) {
            event.preventDefault();
            if (choices.includes(candidate)) void confirm(candidate);
          }
        } else if (event.key === "Tab") {
          const controls = [
            ...(shell.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input",
            ) || []),
          ].filter((control) => control.tabIndex >= 0);
          const first = controls[0],
            last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="settings-title">
        <h3>{code ? "Choose source and code font" : "Choose body font"}</h3>
        <button aria-label="Close font picker" onClick={close}>
          ×
        </button>
      </div>
      <label className="font-search">
        Search families
        <input
          ref={input}
          type="search"
          name="font-search"
          autoComplete="off"
          spellCheck={false}
          aria-label="Search font families"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setCandidate(
              ["", ...(fonts || [])].find((font) =>
                (font || "System default")
                  .toLocaleLowerCase()
                  .includes(event.target.value.toLocaleLowerCase()),
              ) || "",
            );
          }}
        />
      </label>
      <p role="status">{status}</p>
      <div role="listbox" aria-label="Font families" className="font-options">
        {choices.map((font) => (
          <button
            key={font}
            role="option"
            aria-selected={selected === font}
            data-candidate={candidate === font}
            disabled={saving}
            tabIndex={candidate === font ? 0 : -1}
            onFocus={() => setCandidate(font)}
            onClick={() => void confirm(font)}
            style={{ fontFamily: fontStack(font, code) }}
          >
            {font || "System default"}
            {selected === font && <span aria-hidden="true"> ✓</span>}
          </button>
        ))}
        {!choices.length && <p>No matching fonts.</p>}
      </div>
      <p>
        Click a font or press Enter to apply. Arrow keys browse without changing
        your document’s font.
      </p>
    </div>
  );
  const host = document.querySelector("main");
  return host ? createPortal(panel, host) : null;
}
