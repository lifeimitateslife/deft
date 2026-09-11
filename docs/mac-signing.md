# Free Mac distribution and optional Apple signing

DEFT can be distributed for free without an Apple Developer membership. The default release is a DMG with a complete ad-hoc application signature. It has no Apple-verified publisher or notarization ticket, so macOS can block the first launch. This is a disclosed installation step, not a reason to prevent a free release.

## Install a free release

1. Download the correct Mac DMG from the official release page and drag DEFT into Applications.
2. Try to open DEFT once. If macOS blocks it, dismiss the alert.
3. Open System Settings > Privacy & Security, scroll to Security, and choose Open Anyway for DEFT.
4. Authenticate if asked and choose Open. macOS remembers an exception for that app.

These are [Apple's documented instructions](https://support.apple.com/en-us/102445). Only approve the copy from the official release after verifying its checksum. Managed Macs may prohibit exceptions. The same steps ship inside the disk image as `INSTALL-MAC.txt`. Do not disable Gatekeeper or System Integrity Protection system-wide.

The 0.2.3 Apple Silicon app had an additional packaging defect: its executable retained Electron's linker signature, with no sealed resources and no bound Info.plist. Strict code-signature verification failed even though the download checksum matched. Version 0.2.4 seals the complete bundle, retains hardened runtime with Electron's required entitlements, and checks the final app and DMG. This fixes that signature defect, not Apple's lack-of-notarization warning. If a matching-checksum download is still blocked and Open Anyway is unavailable or fails, report the macOS version and exact alert in a GitHub issue.

## Build and publish without paid credentials

`npm run package` and normal CI/tag builds use `mac.identity: "-"`, with no certificate or account required. Hardened runtime stays enabled. The entitlements allow Electron's JIT and loading its bundled frameworks without a shared Apple Team ID, as described in [electron-builder's signing documentation](https://www.electron.build/v26/docs/features/code-signing/code-signing-mac/).

Every Mac package must pass `node scripts/verify-mac.cjs /path/to/DEFT.app`. Packaged functional tests run after signature verification. CI mounts the generated DMG read-only and verifies the enclosed application. Review the actual successful validation output, not only the job's green status.

Follow the repository release procedure: use a new version, collect passing Windows and both Mac artifacts, publish checksums and verification evidence, and then update download links. Preserve earlier immutable releases. Label free builds as not Apple-notarized and include the first-launch instructions. Gatekeeper rejection without an exception is expected for this release mode and must not be described as automatic first-launch acceptance.

## Optional notarized releases

Paid Apple signing is optional. To produce an identified-publisher, notarized build, configure these GitHub Actions secrets and manually run Build and test with `signed_macos` enabled:

| Secret | Value |
| --- | --- |
| `CSC_LINK` | Base64-encoded Developer ID Application certificate export (.p12), including its private key |
| `CSC_KEY_PASSWORD` | Password protecting the certificate export |
| `APPLE_ID` | Apple account used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that account |
| `APPLE_TEAM_ID` | Apple Developer team ID |

Keep credentials in GitHub secrets, never in source files, logs, issues or chat. The optional `electron-builder.mac-release.cjs` configuration requires these values, a distribution signing identity, hardened runtime and notarization. It must not silently downgrade to an ad-hoc build if selected.

For this optional mode, `node scripts/verify-mac.cjs /path/to/DEFT.app --distribution` additionally requires a stapled notarization ticket and Gatekeeper acceptance. These checks apply to the app mounted from the final DMG. A signature-only pass does not establish notarization or automatic first-launch acceptance.
