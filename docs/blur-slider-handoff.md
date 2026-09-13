# Blur slider handoff

This development branch implements the Mac backend and shared settings/UI. Windows native adjustable blur is still pending. Do not publish these candidate artifacts over the existing 0.2.6 release. Keep the version unchanged until both platforms are ready for a coordinated new release.

## Windows session entry point

Fetch `feature/macos-blur-strength` and create a Windows working branch from its latest commit. Preserve the Mac implementation. The associated PR contains build results for the candidate; do not assume GitHub main contains this work.

Implement genuine Windows blur strength and return a PR into this branch, or send its exact commit for integration. Do not simulate strength using opacity or mapping all nonzero values to Acrylic. Leave Mac source and its native build unchanged. Keep existing tests passing and add a Windows pixel test with a controlled detailed backdrop, fixed opacity and several intermediate values. Verify focus/inactive behavior, resizing, minimize/restore, opaque foreground, persistence and accessibility/unsupported-system fallback. Do not independently publish a release.

## Shared contract

- `Settings.backgroundBlurStrength`: integer 0 to 100. Zero means clear/no blur. Default is 40. This is independent of `glassOpacity`.
- `desktop/blur-settings.cjs` normalizes/clamps values and migrates old booleans: false becomes 0, true/missing becomes 40. An explicit numeric patch wins; an old boolean-only patch still works.
- `backgroundBlur` remains a compatibility field, synchronized to `strength > 0`.
- Both renderer `configure` and main settings IPC normalize through the same helper.
- `material()` returns `blurStrengthSupported`. True enables the existing range control in `Appearance.tsx`; false retains the honest legacy toggle. Windows currently returns false.
- A backend must disable its blur in Solid mode and when system accessibility requires an opaque window, without discarding the chosen strength. Unsupported systems retain their current fallback.
- Reset and Revert include the new value. Settings persist through the existing profile mechanism. Renderer cannot provide native handles.

## Mac backend

`native/mac-blur.mm` is a small Node-API addon. `npm run build` invokes `scripts/build-mac-blur.cjs` on Mac only. It uses Xcode command-line tools and the headers shipped beside Node; no new runtime package is required. The ignored generated file `desktop/native/mac-blur.node` is included and unpacked by electron-builder. Build it on the target Mac architecture.

The addon resolves `CGSMainConnectionID` and `CGSSetWindowBackgroundBlurRadius` from SkyLight dynamically. These are **undocumented macOS APIs**, not a public Apple-supported adjustable-blur API. The strength maps to a WindowServer radius of `round(strength / 2)`, producing 51 radius levels across the slider. The adapter falls back to standard vibrancy on missing symbols, load failure or reported call failure. A future OS change that silently ignores the call may require an update; successful return status alone does not prove pixels changed. This approach is for the project's direct-download distribution, not a Mac App Store compatibility claim.

WindowServer skips fully transparent pixels. While native blur is active, a constant 1/255 black background alpha enables the filter. That seed is identical at all nonzero strengths; the slider changes the native radius, not this alpha. Zero blur restores a fully clear base. Foreground/window opacity remains 1. The old HUD vibrancy tint is replaced by the adjustable effect on supported Macs; the existing background-fill slider still controls opacity.

## Verification

- `npm test`: settings migration, bounded/invalid values and native-adapter fallback, plus existing source tests.
- `node tests/mac-blur-ui.mjs`: real range control, intermediate value, persistence, independent opacity, zero/reset/revert and Solid disabling. Runs in packaged Mac suites.
- `DEFT_KOFFI_MODULE=/absolute/path/to/koffi node tests/mac-blur-strength.mjs`: own-process compositor capture over controlled stripes. Checks strengths 0/10/30/60/100, a fully opaque foreground marker, resize, minimize/restore and Solid isolation. It fails if the host is locked or the intermediate values do not change measured detail.
- Existing Mac opacity/foreground compositor tests and all existing packaged application suites remain enabled.

Local macOS 14.5 measured stripe contrast (standard deviation) 126.31, 120.94, 94.76, 53.68 and 13.39 at those five strengths, with opacity fixed at zero. Resizing/restoring retained the expected blur; Solid had zero backdrop contrast. These are controlled test results, not a guarantee for untested future macOS versions.
