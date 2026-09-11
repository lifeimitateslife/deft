# Windows file handoff correction

The 0.1.0 intermittent timeout was not a file-extension limitation. Three simultaneous invocations reproduced missing tabs. All filenames reached the main process and the storage opener, but concurrent recent-file settings writes raced while replacing settings.json. Windows returned EPERM and the successful document-open results were never delivered to the renderer.

Two timing contributors were also observed: focus() reentered the native handoff callback, and several queued notifications could drain one batch then open unintended file pickers on the remaining empty notifications.

The fix uses the existing DocumentStore serialization queue for settings snapshots, gives pending delivery a dedicated IPC command, and defers activation until after the handoff callback returns. It does not add retries, increase timeouts, disable single-instance behavior, or suppress failures. Document encoding/saving code is unchanged.

Regression: npm run test:handoff. Restoring only the old settings writer reproduces the missing-tab timeout and EPERM. The harness delays the real settings rename by 25 ms to make overlap observable; it does not replace the filesystem operation. It asserts one settings writer, no unsolicited dialog, deferred focus, delivery of every requested file, duplicate reuse, and exact save-close-reopen behavior for text and Markdown. A 5-second bound remains on secondary process exit and receipt.

Five independent source runs with DEFT_HANDOFF_ROUNDS=40 passed 615 handoffs. Final packaged/installed repetitions and shell association evidence are recorded with the release, separately from these source results.

Independent code-review-and-quality review approved the native implementation. Its required test-discovery change was addressed with a named script, a source CI step, and execution from the packaged-test runner. System-theme/reduced-motion checks were moved into the existing UI suite. The repeated save test now waits for expected disk bytes, because an earlier Saved notice can outlive a subsequent asynchronous write.

Visual scope is limited to 100-130 ms control, tab and notice feedback. Existing system-default appearance remains; both OS reduced motion and the application preference disable motion. There is no document-content animation or redesign.
