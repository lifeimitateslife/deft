# DEFT

A fast, focused text and Markdown editor for Windows and macOS.

![DEFT on Windows](docs/deft-windows.png)

Open a file, work, save. No account, vault, server, or subscription.

## Install

Download from [Releases](https://github.com/lifeimitateslife/deft/releases).
On Windows x64, use **DEFT.Setup.0.1.2.exe**. On an Apple Silicon Mac, use the arm64 DMG; Intel Macs use the x64 DMG.

The [0.1.2 prerelease](https://github.com/lifeimitateslife/deft/releases/tag/v0.1.2) includes checksums, a claim audit, and verification evidence. Try copies of your own files before choosing DEFT as your everyday default.

Builds are unsigned. Windows may show an unknown-publisher warning. Verify the release checksum before choosing to run the installer. On macOS, drag DEFT to Applications. If macOS blocks this unsigned application, use System Settings > Privacy & Security > Open Anyway for DEFT. Do not disable system security.

To choose DEFT for `.md` and `.txt`, use Windows Settings > Apps > Default apps, or Finder > Get Info > Open with > DEFT > Change All. Installation does not require changing defaults.

## Editing

- Plain text and Markdown documents, tabs, native Open/Save dialogs, recent files, and file drops.
- Live Markdown, exact source, and read-only rendered views. Headings, emphasis, tasks, tables, local images, code, and dollar-delimited math.
- Find/replace, undo/redo, go to line, word wrap, line numbers, text size, and read-only editing.
- Light, Dark, and System appearance; Glass and Solid material choices. Native backdrop support depends on the OS. This is not Apple's Liquid Glass.
- HTML export, native Print, and PDF export.
- Explicit Save by default, optional autosave, and recovery of open tabs and drafts.

Any extension, including no extension, can open as text. Markdown extensions select Markdown mode; other files stay plain. UTF-8 and BOM-marked UTF-16 are supported. Binary-looking or invalid UTF-8 files require confirmation; the legacy fallback is reversible Windows-1252. Characters that cannot be saved in the original encoding are rejected; use Save a UTF-8 copy.

Opening and switching views do not rewrite files. Saves preserve supported encoding, BOM, mixed line endings, whitespace, and trailing newlines. File replacements use temporary siblings and check for external changes. Clean documents refresh after external edits; dirty documents offer choices.

Remote images are blocked. Local images must be inside the document folder. Paste or drop PNG images into saved Markdown documents to store them in an `assets` subfolder. Embedded HTML is displayed as text.

## Shortcuts

Use Ctrl on Windows and Command on macOS.

| Shortcut | Action |
| --- | --- |
| Ctrl/Command+N | New text |
| Ctrl/Command+Shift+N | New Markdown |
| Ctrl/Command+O | Open |
| Ctrl/Command+S | Save |
| Ctrl/Command+Shift+S | Save As |
| Ctrl/Command+W | Close tab |
| Ctrl/Command+F | Find and replace |
| Ctrl/Command+L | Go to line |
| Ctrl/Command+P | Print |
| Ctrl/Command+, | Settings |

## Limits

This is an early prerelease. Rich views are limited to documents under 500,000 characters; the file-opening limit is 32 MiB. Recovery is limited to 64 MiB and 100 tabs. Recovery snapshots are debounced by 500 ms, so the last fraction of a second before a crash may be missing.

Live view reveals source for editing tables and math. Some Markdown constructs remain source. Image importing currently accepts PNG. Read-view task boxes are not editable; use Live or Source. No remote image opt-in is provided.

External changes are checked every 2.5 seconds. A writer that changes a file in the short interval between the final check and filesystem replacement cannot be completely excluded. Hard links, extended attributes, and custom Windows ACL preservation are not guaranteed. Deleted or renamed files require reopening or Save As. Windows registration and per-user installation were tested; interactive default selection and macOS installation remain unverified; see [verification](docs/verification.md).

Settings and recovery live in `%APPDATA%/deft` on Windows and `~/Library/Application Support/deft` on macOS. Uninstalling does not delete documents. Settings includes a Clear recovery control.

## Build

Install Node.js 24 and Git, then:

```sh
git clone https://github.com/lifeimitateslife/deft.git
cd deft
npm ci
npm test
npm run build
npm start
```

`npm run test:handoff` tests simultaneous and successive file invocations, native settings-write serialization, and save/reopen behavior. On Windows, `DEFT_HANDOFF_ROUNDS=40` runs 123 handoffs per process launch (set the variable using your shell).

`npm run test:ui` exercises Electron with synthetic files and disposable profiles under `.scratch/`. `npm run package` builds a Windows installer or macOS DMG on the corresponding OS. `npm run icons` regenerates platform icons from the original vector design. Lockfiles and original icon sources are included.

Electron owns native operations, React supplies the interface, and CodeMirror preserves editor state. [AGENTS.md](AGENTS.md) describes document-safety rules. Original code is MIT licensed; bundled dependencies retain their notices in `THIRD-PARTY-NOTICES.txt` and Electron's license files.
