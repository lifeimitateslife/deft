import { useRef, useState } from "react";
import type { DocumentEditor } from "./editor";

export function TabStrip({
  tabs,
  current,
  select,
  close,
  reorder,
}: {
  tabs: DocumentEditor[];
  current?: DocumentEditor;
  select: (id: string) => void;
  close: (tab: DocumentEditor) => unknown;
  reorder: (id: string, target: string) => void;
}) {
  const dragged = useRef<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  function move(id: string, destination: string) {
    if (id === destination) return;
    const index = tabs.findIndex((tab) => tab.doc.id === destination);
    const tab = tabs.find((tab) => tab.doc.id === id);
    if (!tab || index < 0) return;
    reorder(id, destination);
    setAnnouncement(
      `${tab.doc.name} moved to position ${index + 1} of ${tabs.length}.`,
    );
  }
  return (
    <>
      <nav
        className="tabs"
        aria-label="Open documents"
        onDragOver={(event) => {
          if (!dragged.current) return;
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left + 30)
            event.currentTarget.scrollLeft -= 30;
          if (event.clientX > bounds.right - 30)
            event.currentTarget.scrollLeft += 30;
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setTarget(null);
        }}
      >
        {tabs.map((tab, index) => (
          <div
            key={tab.doc.id}
            className={`tab ${tab === current ? "active" : ""} ${target === tab.doc.id ? "drop-target" : ""}`}
            onDragOver={(event) => {
              if (!dragged.current) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setTarget(tab.doc.id);
            }}
            onDrop={(event) => {
              if (!dragged.current) return;
              event.preventDefault();
              event.stopPropagation();
              move(dragged.current, tab.doc.id);
              dragged.current = null;
              setTarget(null);
            }}
          >
            <button
              aria-pressed={tab === current}
              title={`${tab.doc.path || "Unsaved document"}\nDrag to reorder. Alt+Left/Right moves a focused tab.`}
              draggable
              onDragStart={(event) => {
                dragged.current = tab.doc.id;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(
                  "application/x-deft-tab",
                  tab.doc.id,
                );
              }}
              onDragEnd={() => {
                dragged.current = null;
                setTarget(null);
              }}
              onKeyDown={(event) => {
                if (
                  !event.altKey ||
                  event.ctrlKey ||
                  event.metaKey ||
                  event.shiftKey ||
                  !["ArrowLeft", "ArrowRight"].includes(event.key)
                )
                  return;
                event.preventDefault();
                event.stopPropagation();
                const destination =
                  tabs[index + (event.key === "ArrowLeft" ? -1 : 1)];
                if (destination) {
                  move(tab.doc.id, destination.doc.id);
                  const button = event.currentTarget;
                  requestAnimationFrame(() =>
                    button.scrollIntoView({
                      block: "nearest",
                      inline: "nearest",
                    }),
                  );
                }
              }}
              onClick={() => select(tab.doc.id)}
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
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </>
  );
}
