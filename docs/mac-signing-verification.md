# Mac packaging repair verification - 2026-09-11

Historical first repair pass. The owner subsequently selected free, unnotarized distribution. The requirement below to obtain paid Apple credentials before publishing was overly restrictive and is superseded by [the current release policy](mac-signing.md). The measured signature failures and tests remain valid historical evidence.

Verdict: incomplete bundle signature repaired in a local development build; public distribution remains blocked on Apple signing credentials and notarization. No new public installer is approved by this report.

## Inputs and candidate

- Repository baseline: `78383758d12c7fd3e4dfe3893b1ffeae269f99c2`.
- Published input: `v0.2.3`, `DEFT-0.2.3-arm64.dmg`.
- Download SHA-256: `0eeaaa21ad3303b573d0ff943bad6daff580a570183cb8196d7290b99082be17`, matching the published checksum.
- Local candidate: same application version, explicit final ad-hoc signing and release validation changes. Development DMG SHA-256: `7f082896914d4a012e4d9c0c58414d46c80c64b73a1f2b7eccfd04f8db17f735`. This local file does not replace the immutable public asset with the same filename.
- Environment: Apple Silicon, macOS 14.5 (23F79), Node 26.8.1, Electron 44.3.0, electron-builder 26.15.3. CI uses Node 24.

## Executed measurements and controls

1. Original disk image: `hdiutil verify` passed; SHA-256 matched the release. Download corruption is not the cause for this specimen.
2. Original app: `node scripts/verify-mac.cjs /private/tmp/deft-inspect/DEFT.app` failed with `code has no resources but signature indicates they must be present`. Signature details reported `Identifier=Electron`, `Info.plist=not bound`, `Sealed Resources=none`, and an ad-hoc linker signature.
3. Rebuilt application: the same strict, deep signature checker passed for all nested code and the app resource seal.
4. Rebuilt DMG: image verification passed. The app mounted read-only from the final DMG also passed the signature checker.
5. Negative public-distribution control: `--distribution` correctly rejected the development app because it has no stapled notarization ticket (stapler exit 65). A separate `spctl --assess` rejected it. This is not a public-ready build.
6. Missing-credential control: loading the public release configuration without credentials failed with `Mac release requires CSC_LINK`.
7. `npm test`: 26/26 passed. `npm run build`: passed, with existing Vite configuration and large-chunk warnings.
8. `node scripts/package-test.cjs`: passed all nine packaged suites: native editing/export, second-instance handoff (39 deliveries), session recovery, last-tab behavior, appearance, preferences, formatting shortcuts, saves in flight, and clipboard. Synthetic documents and isolated test profiles were used.
9. Changed executable/config files passed Prettier; workflow YAML parsed with all three platform matrix entries; `git diff --check` passed.
10. The first PR CI run caught a second packaging path: electron-builder skips all signing during PR builds, including ad-hoc signing. The new signature gate rejected that output. The development packaging step now explicitly permits PR signing, with certificate discovery disabled and no signing secrets supplied. Public signing remains a separate tag/manual step.
11. Log inspection of the next CI run caught an empty-array expansion failure in macOS's Bash 3.2 that skipped the mounted-app check despite a green job. The command now uses explicit branches, and cleanup preserves the verification exit status. A green job without the actual signature result is not accepted as evidence.

## Review and limitations

Reviewed correctness, readability, architecture, security and performance. The fix stays in packaging and validation; it adds no runtime dependency or editor behavior. Windows packaging settings remain untouched. Developer signing is explicitly distinguished from release signing. The release configuration requires credentials, a distribution identity, hardened runtime and notarization; CI checks the application inside the final DMG, including Gatekeeper for releases.

No valid local code-signing identities and no GitHub repository secrets were available at inspection. Developer ID signing, notarization, and a browser-download first launch on an independent Mac therefore remain unverified. Local execution does not prove Gatekeeper acceptance. Intel and Windows need the corresponding CI runs. Existing releases, tags, installers, checksums and download targets are preserved.

The next owner boundary is provision of the five Apple signing/notarization secrets described in [mac-signing.md](mac-signing.md). After provisioning, signed builds must pass on both Mac architectures before a new versioned release and download-link update. There is no public-release READY verdict or approved release manifest in this repair.
