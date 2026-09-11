# Verification

This page records the scope of testing, not a guarantee against every filesystem or OS failure.

## Local Windows checks

Storage tests cover byte-identical round trips, UTF-8 BOM and UTF-16, mixed endings, legacy encoding refusal, external conflicts, case aliases, queued writes, recovery identity, and discarding one tab while retaining another draft.

Editor-state tests cover grouped undo/redo with exact source and boundary formatting with mixed endings.

Electron workflow tests use real synthetic files and native filesystem operations. They cover editing, saving, undo, mode changes, themes/material choices, opening a second process, duplicate opens, unknown extensions, search/replace, read-only mode, external refresh, hostile Markdown, math, and a 2.2 MB text file. Real HTML and PDF exports also run, with the test supplying the native save-dialog destination. A delayed external reload checks that typing in flight survives. Test profiles stay under `.scratch/`.

The tests use Playwright's Electron driver. No custom test driver or automation endpoint is included in the installed application. Native file-dialog and installer acceptance are recorded separately from these automated workflows.

## Release acceptance

The Windows release candidate installed successfully per user. Registry snapshots before and after installation showed no changes to the five registered extensions' existing default or UserChoice values. DEFT's quoted executable command and OpenWithProgids registration were present. The installed executable passed the native workflow suite with an isolated profile and synthetic documents. One initial installed test timed out waiting for a secondary open; an isolated reproduction and the full rerun passed. This is retained as an intermittent acceptance observation.

Windows x64, macOS arm64, and macOS x64 candidates passed unit tests and both source and packaged Electron workflows on native GitHub runners. The final tagged workflow and release-specific checksums are linked from the release. These are native execution results, not proof of macOS Finder installation or default-app selection.

No signed or notarized artifact has been produced. Native Open dialog presentation was observed, but completing the native picker was not reliably exercised by desktop automation. Save-dialog paths in automated export tests are supplied by the harness. Physical printer output, interactive default-app selection, and macOS drag-to-Applications acceptance remain unverified.

## Known boundaries

There is no physical-printer test. Screen-reader and high-contrast behavior have code-level checks but no complete assistive-technology acceptance run. Custom ACLs, hard links, extended attributes, network drives, disk power loss, and macOS Finder default-app behavior require further platform testing.

Recovery is a debounced snapshot, not a keystroke journal. File replacement checks cannot coordinate with a separate writer that ignores filesystem locking.
