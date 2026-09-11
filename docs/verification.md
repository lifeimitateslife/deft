# Verification

This page records the scope of testing, not a guarantee against every filesystem or OS failure.

## Local Windows checks

Storage tests cover byte-identical round trips, UTF-8 BOM and UTF-16, mixed endings, legacy encoding refusal, external conflicts, case aliases, queued writes, recovery identity, and discarding one tab while retaining another draft.

Editor-state tests cover grouped undo/redo with exact source and boundary formatting with mixed endings.

Electron workflow tests use real synthetic files and native filesystem operations. They cover editing, saving, undo, mode changes, themes/material choices, opening a second process, duplicate opens, unknown extensions, search/replace, read-only mode, external refresh, hostile Markdown, math, and a 2.2 MB text file. Test profiles stay under `.scratch/`.

The tests use Playwright's Electron driver. No custom test driver or automation endpoint is included in the installed application. Native file-dialog and installer acceptance are recorded separately from these automated workflows.

## Release acceptance

Release packaging, installer acceptance, macOS execution, and public-download verification are pending. No signed or notarized artifact has been produced.

## Known boundaries

There is no physical-printer test. Screen-reader and high-contrast behavior have code-level checks but no complete assistive-technology acceptance run. Custom ACLs, hard links, extended attributes, network drives, disk power loss, and macOS Finder default-app behavior require further platform testing.

Recovery is a debounced snapshot, not a keystroke journal. File replacement checks cannot coordinate with a separate writer that ignores filesystem locking.
