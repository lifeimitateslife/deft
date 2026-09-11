# Mac signing and release checks

## Why 0.2.3 can appear damaged

The published Apple Silicon disk image passes its checksum, but the application inside fails `codesign --verify --deep --strict`: `code has no resources but signature indicates they must be present`. Its executable retains Electron's linker signature, with no sealed resources and no bound Info.plist. The old CI explicitly disabled certificate discovery and never checked package signatures. Launch tests on a build runner did not catch this download/install failure.

## Development builds

`npm run package` seals the final Mac bundle with an explicit ad-hoc identity. Hardened runtime is disabled only for these development builds. These builds have no verified publisher or Apple notarization and must not be promoted as public-ready installers. Do not disable Gatekeeper or remove quarantine as a release fix.

`node scripts/package-test.cjs` checks the final application's signature before launching its tests. CI also mounts the generated DMG read-only and checks the signature of the actual enclosed application.

## Public release prerequisites

The repository owner must configure these GitHub Actions repository secrets using an Apple Developer account:

| Secret | Value |
| --- | --- |
| `CSC_LINK` | Base64-encoded Developer ID Application certificate export (.p12), including its private key |
| `CSC_KEY_PASSWORD` | Password protecting the certificate export |
| `APPLE_ID` | Apple account used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that account |
| `APPLE_TEAM_ID` | Apple Developer team ID |

Keep credentials in GitHub secrets, never in source files, logs, issues or chat. The release configuration requires all five values and fails if the signing identity cannot be found. It enables hardened runtime and notarization, and only accepts a distribution signing identity.

For local release builds with these variables already set:

```sh
npm run build
npx electron-builder --mac --arm64 --config electron-builder.mac-release.cjs --publish never
```

Use `--x64` on an Intel runner. Existing Windows packaging settings are unaffected.

## Release verification and publication

Tag builds automatically use the signed Mac configuration. The Build and test workflow can also be run manually with `signed_macos` enabled. Normal branch/PR builds produce development artifacts.

In addition to source and packaged functional tests, signed Mac builds must pass all of these checks on the application mounted from the final DMG:

```sh
codesign --verify --deep --strict --verbose=2 /path/to/DEFT.app
xcrun stapler validate /path/to/DEFT.app
spctl --assess --type execute --verbose=4 /path/to/DEFT.app
```

`node scripts/verify-mac.cjs /path/to/DEFT.app --distribution` runs all three and fails on any rejection. A passing ad-hoc signature check alone is insufficient.

Follow the existing release procedure: use a new version, retain immutable published assets, collect passing Windows and both signed Mac builds, publish with checksums and evidence, and update download links only after publication. Then confirm a browser-downloaded installer opens on a separate Mac with its normal security settings. No replacement public Mac installer is approved until these release checks pass.
