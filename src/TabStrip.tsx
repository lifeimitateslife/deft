import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DocumentEditor } from "./editor";

type Drag = {
  id: string;
  pointer: number;
  startX: number;
  x: number;
  scroll: number;
  started: boolean;
  destination: string;
};

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
  const root = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const frame = useRef(0);
  const before = useRef<Map<string, number> | null>(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<Record<string, number>>({});
  const [announcement, setAnnouncement] = useState("");
  const nodes = () => [
    ...(root.current?.querySelectorAll<HTMLElement>(".tab") || []),
  ];
  const reduced = () =>
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    root.current?.closest("main")?.getAttribute("data-reduced-motion") ===
      "true";
  function capture() {
    before.current = new Map(
      nodes().map((node) => [
        node.dataset.id!,
        node.getBoundingClientRect().left,
      ]),
    );
  }
  useLayoutEffect(() => {
    if (!before.current) return;
    for (const node of nodes()) {
      const left = before.current.get(node.dataset.id!);
      const delta =
        left === undefined ? 0 : left - node.getBoundingClientRect().left;
      node.getAnimations().forEach((animation) => animation.cancel());
      if (delta && !reduced())
        node.animate(
          [
            { transform: `translateX(${delta}px)` },
            { transform: "translateX(0)" },
          ],
          { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
    }
    before.current = null;
  }, [tabs, preview]);
  useLayoutEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(() => {
    const cancel = () => finish(false);
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, [tabs]);
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
  function tick() {
    const state = drag.current,
      nav = root.current;
    if (!state?.started || !nav) return;
    const bounds = nav.getBoundingClientRect();
    if (state.x < bounds.left + 40)
      nav.scrollLeft -= Math.min(16, (bounds.left + 40 - state.x) / 3);
    else if (state.x > bounds.right - 40)
      nav.scrollLeft += Math.min(16, (state.x - bounds.right + 40) / 3);
    const elements = nodes();
    const source = elements.findIndex((node) => node.dataset.id === state.id);
    if (source < 0) {
      finish(false);
      return;
    }
    const element = elements[source];
    const delta = state.x - state.startX + nav.scrollLeft - state.scroll;
    const center = element.offsetLeft + element.offsetWidth / 2 + delta;
    let target = source;
    for (let i = 0; i < elements.length; i++) {
      const middle = elements[i].offsetLeft + elements[i].offsetWidth / 2;
      if (i > source && center > middle) target = i;
      if (i < source && center < middle) {
        target = i;
        break;
      }
    }
    state.destination = elements[target].dataset.id!;
    const next: Record<string, number> = {};
    const gap = parseFloat(getComputedStyle(nav).columnGap) || 0;
    elements.forEach((node, index) => {
      next[node.dataset.id!] =
        index === source
          ? delta
          : source < index && index <= target
            ? -(element.offsetWidth + gap)
            : target <= index && index < source
              ? element.offsetWidth + gap
              : 0;
    });
    setPreview(next);
    frame.current = requestAnimationFrame(tick);
  }
  function finish(commit: boolean) {
    const state = drag.current;
    if (!state) return;
    cancelAnimationFrame(frame.current);
    if (state.started) {
      capture();
      suppressClick.current = true;
      if (commit) move(state.id, state.destination);
    }
    drag.current = null;
    setPreview({});
  }
  return (
    <>
      <nav
        ref={root}
        className="tabs"
        data-dragging={!!drag.current?.started}
        aria-label="Open documents"
      >
        {tabs.map((tab, index) => (
          <div
            key={tab.doc.id}
            data-id={tab.doc.id}
            className={`tab ${tab === current ? "active" : ""} ${drag.current?.started && drag.current.id === tab.doc.id ? "dragging" : ""}`}
            style={{
              transform: preview[tab.doc.id]
                ? `translateX(${preview[tab.doc.id]}px)`
                : undefined,
            }}
          >
            <button
              aria-pressed={tab === current}
              title={`${tab.doc.path || "Unsaved document"}\nDrag to reorder. Alt+Left/Right moves a focused tab.`}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                suppressClick.current = false;
                nodes().forEach((node) =>
                  node
                    .getAnimations()
                    .forEach((animation) => animation.cancel()),
                );
                drag.current = {
                  id: tab.doc.id,
                  pointer: event.pointerId,
                  startX: event.clientX,
                  x: event.clientX,
                  scroll: root.current!.scrollLeft,
                  started: false,
                  destination: tab.doc.id,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const state = drag.current;
                if (!state || state.pointer !== event.pointerId) return;
                state.x = event.clientX;
                if (!state.started && Math.abs(state.x - state.startX) >= 5) {
                  state.started = true;
                  tick();
                }
              }}
              onPointerUp={() => finish(true)}
              onPointerCancel={() => finish(false)}
              onLostPointerCapture={() => finish(false)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && drag.current) {
                  event.preventDefault();
                  finish(false);
                  return;
                }
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
                  capture();
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
              onClick={() => {
                if (!suppressClick.current) select(tab.doc.id);
                suppressClick.current = false;
              }}
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
