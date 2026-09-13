# Windows blur strength handoff

Windows branch: `codex/windows-blur-strength`, PR #6 into `feature/macos-blur-strength`. The base is the Mac session's tested commit `998d65809140b522a3a4e7d2fc7e1ea8a35915cf`. The version stays 0.2.6. These are candidate builds only, not a release or replacement for public installers.

## Implementation and shared contract

The existing shared slider and migration are reused unchanged: `backgroundBlurStrength` is an integer from 0 to 100, default 40, with zero clear. `backgroundBlur` remains the synchronized compatibility field. Old false migrates to 0 and true/missing to 40. Background fill remains `glassOpacity`, default 68, independently controlled by the renderer.

`native/windows-blur.cpp` is an MIT-licensed Node-API addon using Windows Composition. A bottom desktop target under Chromium contains a sprite with a Gaussian effect. Strength sets `Blur.StandardDeviation` to `strength / 2`, with hard borders. Its source is `CreateBackdropBrush()`, not a screenshot or the preset-blurred host backdrop brush. The app does not capture the screen, inject code into other processes, change DWM globally, change whole-window opacity, or add a variable tint. The foreground stays in Chromium's separate visual layer. Pixel tests verify this arrangement on the tested Windows host and CI runner.

The addon owns a dedicated STA dispatcher queue. All composition operations run on that queue. Relative visual sizing follows the native target during resizing. Closing releases its visuals and drains `ShutdownQueueAsync()` before releasing the queue. Only a valid HWND owned by the calling process and UI thread is accepted. Native handles remain in the main process.

`desktop/windows-blur.cjs` enables the shared slider only after the native backend initializes and applies successfully. Missing/incompatible binaries or reported native failure retain the existing Acrylic on/off fallback and report `blurStrengthSupported: false`. The existing Windows 11 22H2 minimum is retained. Solid, high contrast and reduced transparency disable the effect without erasing the selected strength.

No Mac native code, Mac adapter, Mac build script, shared preference implementation, tab implementation, version, installer options or file associations changed. `tests/session.mjs` now waits for the old CodeMirror element to detach after opening a tab. Previously its fill could race the editor mount and write its fixture into the previous tab. The recovery assertions remain intact.

## Build and reproducible verification

Windows build prerequisites are Node, Python, Visual Studio C++ Build Tools and a Windows SDK with C++/WinRT headers. `npm ci` followed by `npm run build` compiles the addon against the installed Electron version. `node-gyp` 12.4.0 is now an explicit development dependency, already present at that version in the previous lockfile. There are no additional runtime packages or paid services. On Mac, the Windows build step exits immediately.

The existing `asarUnpack` rule includes `desktop/native/windows-blur.node`. Its inspected import table requires only Windows system DLLs, with no separate C++ redistributable dependency. Build a candidate with `npx electron-builder --win --x64 --publish never`. Keep its output in an isolated checkout. Do not upload 0.2.6 candidate installers over public release assets.

Run on an unlocked Windows desktop:

```powershell
$env:DEFT_EXECUTABLE = (Resolve-Path 'release/win-unpacked/DEFT.exe').Path
$env:DEFT_TEST_SECONDARY = '1' # Local owner run only, requires a second monitor
node tests/windows-blur-strength.mjs
node scripts/package-test.cjs
node tests/glass.mjs
npm test
```

CI runs the packaged slider and compositor tests as required Windows steps, with PNG and JSON artifacts named `windows-blur-verification`. The existing Mac compositing tests remain required. `windows-blur-native-candidate` contains the compiled native module for hosts without a local C++ toolchain.

## Local packaged evidence

Tested on Windows 11 build 26100, x64, Electron 44.3.0, second monitor at scale 1. The app reports `isPackaged: true` and version 0.2.6. The native module was built from application-code commit `315d6703ab271cd3c898a3318ac32967aa3a0fcf` in GitHub Actions, then included in the locally packaged app. Later changes are test and documentation changes plus restoration of the original JSON copyright escaping.

| Strength | Gaussian standard deviation | Backdrop detail contrast |
| --- | --- | --- |
| 0 | 0 | 127.5021 |
| 10 | 5 | 115.6975 |
| 30 | 15 | 88.0398 |
| 60 | 30 | 38.6895 |
| 100 | 50 | 4.4428 |

The controlled backdrop uses black/white stripes with a 128-pixel period. Background opacity is fixed at 0 throughout the sweep. Mean backdrop luminance stays between 127.375 and 127.9102. The opaque foreground checker is byte-identical at every strength, and window opacity remains 1. The default background fill is still 68, not the zero fill used to isolate the measurement.

At strength 30, resize, focus loss and minimize/restore each retain contrast 88.0398. Those lifecycle captures do not reapply the material or strength. Solid gives zero backdrop contrast. Returning to zero after Solid restores 127.5021. Narrower 48-pixel-period stripes were also tested during development; their high-frequency detail is already almost gone at strengths 60 and 100, so the final test uses broader stripes to distinguish both upper values.

Slider tests pass intermediate value 73, persisted restart, independent opacity, default reset, zero, Revert, Solid disabling, and injected high-contrast/reduced-transparency signals. Source tests cover native-load failure, reported native failure and close cleanup as well as the unchanged shared migration tests. All 36 source tests and all 12 packaged application suites passed locally, including tab order/recents, file handling, byte preservation, session/recovery, preferences, formatting, undo/redo and update notices. The existing `glass.mjs` compositor regression also passed: light and dark backdrop responses are 239, 77 and 12 at background fills 0, 68 and 95, respectively; Solid is 0, with opaque foreground markers. This suite also exercises maximize/unmaximize and resizing.

[Implementation CI run 34746045846](https://github.com/lifeimitateslife/deft/actions/runs/34746045846) passed Windows x64, Mac ARM64 and Mac Intel, including the new required Windows compositor and slider gates and the existing Mac compositor checks. Check the final PR status for any subsequent test/documentation commit. A separate code review checked the native queue ownership and shutdown; it did not constitute another desktop measurement.

Artifact identity for the local compositor run:

- Native module SHA-256: `d8a6688864bc996d9ee218218fe727d86c98925b26f43c8992688fc326c54acb`
- Packaged `app.asar` SHA-256: `f12df15771bb4d5066de4ec337cf7da8db51d9746b2a09a32dc39f2ee4ca619f`
- Packaged executable SHA-256: `020015369c2c81070b258c72a2187ed03d9c62ae203fa20232ffd40521731465`

## Boundaries for the Mac session

The supported product remains Windows x64 on Windows 11 22H2 or newer. Local pixel proof covers build 26100 and one GPU/display setup. Other GPU drivers, remote/locked desktops, Windows ARM64 and future Windows releases are not covered by that local result. Runtime API success is not a permanent guarantee against an OS or driver changing its compositor behavior; retain the pixel gate when upgrading Electron or Windows runners.

Accessibility signals were injected into the isolated Electron process, not toggled in the owner's Windows settings. Native-load/failure fallbacks have automated coverage; physical GPU/device loss and older Windows machines were not exercised. The normal installer configuration remains unchanged and CI builds it, but the candidate was not installed over the owner's DEFT.

Merge PR #6 into the Mac branch only after the final Windows and both Mac CI jobs pass. Coordinate any version bump and release across both platforms. No extra shared fields are needed from the Mac session.

## API references

- [Microsoft Gaussian backdrop example](https://learn.microsoft.com/en-us/uwp/api/windows.ui.composition.compositor.createbackdropbrush)
- [Windows Composition effect brushes](https://learn.microsoft.com/en-us/uwp/api/windows.ui.composition.compositioneffectbrush)
- [Dispatcher queue ownership and shutdown](https://learn.microsoft.com/en-us/windows/win32/api/dispatcherqueue/nf-dispatcherqueue-createdispatcherqueuecontroller)
