# Contributing to DEFT

## Developer setup

These instructions are for building DEFT from source. To install the finished application, use the downloads in the README.

Use Node.js 24, npm and Git on Windows x64 or a supported macOS machine.

```sh
git clone https://github.com/lifeimitateslife/deft.git
cd deft
npm ci
npm test
npm run build
npm start
```

`npm run package` builds the NSIS Windows installer (Program Files by default, with a custom destination chooser) or macOS DMG on its corresponding OS. GitHub Actions builds Windows x64, macOS Apple Silicon and macOS Intel packages. The runtime and required production dependencies travel with the application.

Mac builds use a free ad-hoc signature to seal the finished application. These releases are not Apple-notarized: users may need to approve DEFT once in System Settings > Privacy & Security > Open Anyway. Paid Apple signing is optional, not a requirement to publish. See [Mac signing and release checks](docs/mac-signing.md).

## Architecture and document safety

Electron owns native operations in `desktop/`. React and CodeMirror own the interface in `src/`. Each document retains an exact source string; editor transactions apply targeted patches. Rendered Markdown is never the saved representation.

Never normalize an opened file. Reject lossy encoding. Check disk content before replacement and resolve symlink targets. Keep recovery until explicit discard. Never log document bodies. Native requests must validate the sender and document identity. Keep renderer Node access disabled and avoid runtime network requests.

Quitting preserves open work before exit. Closing a tab intentionally discards that buffer, never its named file. Recovery, settings writes and saves share a serialized native write boundary. Preserve that ordering when changing session behavior. See [the glossary](CONTEXT.md).

## Verification

Use synthetic documents and disposable profiles under `.scratch/`, never personal drafts. Useful checks:

```sh
npm test
npm run build
npm run test:ui
npm run test:session
npm run test:handoff
node tests/appearance.mjs
node scripts/package-test.cjs
```

For the optional Mac compositor regression test, install its test-only native capture adapter outside the application dependencies:

```sh
npm install --prefix .scratch/mac-capture --no-save koffi@3.2.1
DEFT_KOFFI_MODULE="$PWD/.scratch/mac-capture/node_modules/koffi" node tests/mac-transparency.mjs
```

Run with the Mac unlocked. This captures only the test rectangle occupied by DEFT and its own synthetic backdrop. It verifies an opaque color marker before accepting pixel measurements, tests light/dark blur/clear opacity and Solid, and exercises resizing. It does not use personal documents or change OS privacy settings. Results and captures are saved under `.scratch/mac-transparency-*`. Use `DEFT_EXECUTABLE` to test the final extracted Mac app. The adapter is not bundled with DEFT; renderer-only screenshots cannot validate the native backdrop.

Native tests launch real Electron windows. Set `DEFT_EXECUTABLE` to test an installed executable. `DEFT_HANDOFF_ROUNDS=40` requests 123 delivery attempts in one handoff run. Windows shell acceptance must first verify that the normal profile has no personal session and that DEFT is not already running.

`tests/record-motion.mjs` records only its synthetic DEFT window. It is an explicit Windows visual acceptance task, not a background product capability. It enables capture only inside the disposable test process.

`node tests/update-notice.mjs` exercises the real update checker, IPC bridge and notice UI. It substitutes only the clock, GitHub transport and browser opening inside the isolated test process. It covers offline/rate-limit behavior, daily caching, version dismissal across restarts and future release notices. The packaged suite runs it on Windows and both Mac architectures and saves a synthetic screenshot.

## Artwork

`assets/icon-source.png` is the exact approved DEFT artwork. Do not redraw, vectorize, simplify or recolor it. `npm run icons` reproducibly resizes that source and emits PNG, ICO and ICNS files. Small icons use the same artwork. The product screenshot is a separate capture of the packaged application.

## Releases

Use the existing repository identity and `lifeimitateslife/deft` remote. Do not change global Git author settings or add optional co-author trailers. Preserve published history and immutable versioned assets.

1. Increment the package version and lockfile together.
2. Run source and packaged tests, including session and handoff repetitions.
3. Build the final artifacts with the existing Windows/macOS CI workflow.
4. Publish a new versioned release with checksums and verification evidence.
5. Run `node scripts/update-downloads.cjs VERSION` after publication. It reads actual public release assets, verifies all three expected installers exist, and updates the README download block.
6. Verify anonymous downloads and checksums, then audit README claims against those exact artifacts.

Do not commit installers or scratch outputs. Preserve licenses and notices. First-party prose uses ordinary hyphens rather than em dashes.

`node tests/tabs-recents.mjs` exercises real drag and keyboard tab reordering, draft and undo preservation, session order restoration, and the Recent button with existing tabs, duplicate basenames and missing files. It runs against packaged Windows and Mac apps in CI; the workflow retains a menu screenshot.

The development blur slider contract and platform handoff are documented in [blur-slider-handoff.md](docs/blur-slider-handoff.md). On Mac, `npm run build` compiles the Node-API blur addon using Xcode command-line tools and Node's bundled headers. Generated native binaries are ignored by Git and built per architecture. The Mac compositor stage verifies multiple blur strengths at constant background opacity. Windows adjustable blur is still pending on this branch.
