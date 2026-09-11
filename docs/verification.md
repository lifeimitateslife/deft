# Verification

This page records the scope of testing, not a guarantee against every filesystem or OS failure.

## 0.2.1 release

The [release source and three-platform CI](https://github.com/lifeimitateslife/deft/actions/runs/34569487931) passed 22 unit tests and native packaged workflows on Windows x64, Apple Silicon and Intel Mac. Preferences tests cover gear/shortcut access, font confirmation and dismissal, nested focus, resets, reduced motion, selection/undo and restart persistence. Additional installed Windows checks retain chosen body/code fonts, Custom colors and text size across restart.

The final Windows installer upgraded `C:\Program Files\DEFT` successfully. Its installed executable and app.asar match the freshly extracted CI artifact. Publisher metadata reads Life Imitates Life, the Start menu points to Program Files, and existing owner preferences/recovery bytes were preserved. Two separate installed runs each passed 123 file handoffs, alongside native editing/export and session recovery tests.

Controlled compositor checks against both the extracted and installed app passed on the second monitor. At opacity 0/68/95, white-versus-dark backdrop response was 86/28/4 RGB levels in both themes; Solid response was zero. A marker validates that each capture contains DEFT. Initial fullscreen-obstructed captures were rejected and excluded. Native blur remains controlled by the OS, and very low opacity can reduce contrast.

The exact approved icon remains unchanged; all eight executable and uninstaller icon payloads match. The README screenshot comes from the installed 0.2.1 app using synthetic writing. See the [artifact claim audit](https://github.com/lifeimitateslife/deft/releases/download/v0.2.1/CLAIM-AUDIT.md) for individual claims, evidence and gaps. All three published installer downloads were fetched anonymously in full and matched the release checksums.

Manual Mac installation/Dock acceptance, a new custom-folder installation, live OS accessibility toggles and a clean Windows VM were not repeated. Earlier evidence for unchanged paths remains explicitly versioned below. Builds remain unsigned and not notarized. Local regenerable scratch/build files remain because the prior cleanup approval block is still in effect.

## 0.2.0 release

The source has 21 passing unit tests. Packaged Windows tests cover compact menus, installed fonts, custom colors, session restore and deliberate discard, shutdown locking, and file-handoff behavior. Three consecutive installed-candidate runs each passed 123 handoffs. Separately, three runs against the freshly extracted final CI installer each passed 123 handoffs. The final artifact also passed native editing, export, session, appearance and compositor tests locally. Revo 2.6.0 displayed the installed candidate, approved icon and LIFE IMITATES LIFE publisher.

The installer defaults to Program Files and permits a custom folder. Its elevated destination chooser was observed, but migration completion requires owner interaction. The per-user candidate passed actual Windows ShellExecuteEx txt/md cold launch, seven successive opens and save-close-reopen. See the [versioned artifact audit](https://github.com/lifeimitateslife/deft/releases/download/v0.2.0/CLAIM-AUDIT.md) for evidence and remaining gaps. No clean Windows virtual machine without developer tools was available; bundled-runtime structure does not substitute for that acceptance test.

## 0.2.2 packaged verification

Release source is `91b21a25071a516268be7981d49ac3d44ef6a482`. [Final CI](https://github.com/lifeimitateslife/deft/actions/runs/34579859764) passed on Windows x64 and both native macOS architectures, including packaged keyboard/menu workflows. The freshly extracted final Windows installer passed formatting/shortcuts, overlapping-save, native file-safety, Preferences, recovery/discard and clipboard suites, plus three independent runs totaling 369 file handoffs. Twenty-six unit tests passed.

Formatting now separates file kind from explicit formatted presentation, supports caret typing state, and retains portable source in `.txt`. A separate save queue ensures a second explicit Save waits for an in-flight save and persists the latest buffer. A Mac menu handler no longer steals focus after Command+Option+F. Windows test assertions wait for completed saves before opening their destinations: an earlier immediate disk-read assertion interfered with atomic replacement and exposed EPERM. Exact source assertions and the existing timeout remain. One earlier CI font-list timeout is retained as a failed attempt, not counted as a pass.

The final Windows payload was compared over controlled real background windows on the secondary monitor. Blur-off retained sharp stripe contrast (239, versus 1 with Acrylic), both light/dark opacity controls reduced background response, and Solid stayed opaque. Available physical displays were at 100% scale. Windows controls native Acrylic strength; macOS keeps vibrancy and disables the unsupported blur-off control. Low background opacity can reduce readability over busy backgrounds.

All three extracted ASARs match release source/build assets. Windows app/installer ICO images and Mac app/document ICNS match the approved artwork. The README screenshot is the actual final Windows payload with synthetic writing.

The owner had 0.2.1 open during these checks; it was not force-closed. Installation of 0.2.2 and a current real-profile Explorer/default-app acceptance run remain pending normal session closure. Program Files/custom-path installation was accepted in 0.2.1 and its configuration is unchanged. Packaged verification does not substitute for that pending upgrade. See the [0.2.2 audit](https://github.com/lifeimitateslife/deft/releases/download/v0.2.2/CLAIM-AUDIT.md) for the exact scope and limitations.

## Local Windows checks

Storage tests cover byte-identical round trips, UTF-8 BOM and UTF-16, mixed endings, legacy encoding refusal, external conflicts, case aliases, queued writes, recovery identity, and discarding one tab while retaining another draft.

Editor-state tests cover grouped undo/redo with exact source and boundary formatting with mixed endings.

Electron workflow tests use real synthetic files and native filesystem operations. They cover editing, saving, undo, mode changes, themes/material choices, opening a second process, duplicate opens, unknown extensions, search/replace, read-only mode, external refresh, hostile Markdown, math, and a 2.2 MB text file. Real HTML and PDF exports also run, with the test supplying the native save-dialog destination. A delayed external reload checks that typing in flight survives. Test profiles stay under `.scratch/`.

The tests use Playwright's Electron driver. No custom test driver or automation endpoint is included in the installed application. Native file-dialog and installer acceptance are recorded separately from these automated workflows.

## Historical 0.1.2 release acceptance

The Windows release candidate installed successfully per user. Registry snapshots before and after installation showed no changes to the five registered extensions' existing default or UserChoice values. DEFT's quoted executable command and OpenWithProgids registration were present. The installed executable passed the native workflow suite with an isolated profile and synthetic documents. The 0.1.0 intermittent second-instance failure was reproduced and isolated in 0.1.2: overlapping settings replacements could fail with EPERM before opened documents reached the renderer. Settings writes now use the existing native write queue. Pending notifications no longer fall back to the file picker, and native activation runs after the handoff callback. A settings-only negative control reproduces the missing-tab timeout; five fixed source runs passed 615 handoffs. Release-specific packaged and installed acceptance is attached to the release.

Windows x64, macOS arm64, and macOS x64 candidates passed unit tests and both source and packaged Electron workflows on native GitHub runners. The final tagged workflow and release-specific checksums are linked from the release. These are native execution results, not proof of macOS Finder installation or default-app selection.

No signed or notarized artifact has been produced. Native Open dialog presentation was observed, but completing the native picker was not reliably exercised by desktop automation. Save-dialog paths in automated export tests are supplied by the harness. Physical printer output, interactive default-app selection, and macOS drag-to-Applications acceptance remain unverified.

## Known boundaries

There is no physical-printer test. Screen-reader and high-contrast behavior have code-level checks but no complete assistive-technology acceptance run. Custom ACLs, hard links, extended attributes, network drives, disk power loss, and macOS Finder default-app behavior require further platform testing.

Recovery is a debounced snapshot, not a keystroke journal. File replacement checks cannot coordinate with a separate writer that ignores filesystem locking.
