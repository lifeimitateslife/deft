# DEFT 0.2.0 code review

## Scope and verdict

Reviewed the 0.2.0 document/session persistence, Markdown formatting and tables, appearance preferences, document-first application shell, native command bridge, clipboard image path, menu routing, and shutdown behavior. No source-level release blocker remains in the reviewed changes.

This record covers source review and source checks. It does not claim that the final packaged Windows or macOS artifacts passed installation, launch, shell handoff, signing, or platform acceptance tests; those checks belong to the final release verification.

## Findings resolved

- Session persistence now records the latest text, tab order, active tab, mode, selection, and scroll state. Explicit tab close removes only that recovery buffer, and serialized discard filtering prevents stale queued snapshots from resurrecting it.
- Recovery-write failure keeps the window open and restores editing. Successful quit synchronously makes the document inert, locks CodeMirror through a dedicated compartment, blocks mutating commands, writes recovery, and remains locked through window destruction. The close path uses an internal document creator so final-tab replacement does not deadlock its transition queue.
- Dirty named documents retain their original disk fingerprint, so restored edits keep external-change conflict protection and never overwrite changed disk bytes silently.
- Formatting rejects frontmatter and literal code where required. Clear formatting handles selections spanning multiple marked runs without leaving unmatched Markdown. Nested list and quote containers remain intact, and formatting remains one undoable transaction.
- Table manipulation was extracted from `DocumentEditor` into a focused, typed transaction module. It preserves undo grouping, rejects unsupported nested tables, and resolves trailing-pipe column targeting correctly.
- Windows application-menu focus is restored before native Edit commands. Keyboard menu dismissal does not leave focus in hidden inert content. Native commands use exact allowlists, and renderer-originated native operations retain main-process guards.
- File, formatting, view, PDF, recent-file, preferences, and About commands are present in the applicable Windows and macOS menus. Recent-file state refreshes in the renderer and rebuilds the macOS native menu after changes.
- Clipboard image import remains limited to PNG data and retains size, signature, document-identity, path, and symlink checks in the main process.
- Appearance settings preserve old preferences, constrain editable values, request local-font permission only for the app's main frame, and cache explicit font enumeration. The approved icon source is mechanically resized; no alternate artwork or redraw path is used.

## Five-axis review

- Correctness: the reviewed state transitions are serialized, recovery and failure paths preserve user text, formatting edits respect protected syntax, and menu commands reach guarded handlers.
- Readability: formatting and table policy live in focused modules; the editor remains an adapter around CodeMirror state and transactions.
- Architecture: native filesystem, dialog, shell, printing, and clipboard-side writes remain in the main process. Renderer code requests operations through the preload bridge.
- Security: IPC sender checks, command allowlists, export bounds, image validation, navigation denial, permission checks, and path/symlink validation remain in place.
- Performance: formatting is bounded to syntax/selection ranges, font enumeration is user-triggered and cached, settings and recovery writes are serialized, and no new unbounded background work was found.

## Strict maintainability review

The earlier strict review required removal of table-specific branching from the editor and correction of scattered syntax exceptions. Those changes were made: table edits now use `tableTransaction`, and formatting guards cover fenced and indented code plus nested block containers. No file crossed the 1,000-line threshold, and no further structural change is required for release.

## Source verification observed during review

- `npm test`: 21 tests passed.
- `npm run build`: TypeScript and Vite build passed.
- `git diff --check`: no whitespace error; Git reported line-ending conversion warnings only.
- Targeted source probes reproduced the original formatting and table failures before their fixes and confirmed the corrected results afterward.

Final packaged-artifact verification remains intentionally unclaimed here.
