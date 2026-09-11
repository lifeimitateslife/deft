# Motion plans

| Plan | Order | Status |
| --- | --- | --- |
| 001-interface-motion.md | 1 | Implemented and verified in packaged Windows build |
| 002-preferences-motion.md | 2 | TODO - depends on the targeted nested font picker and gear implementation |

No dependency additions. Packaged appearance tests and native motion recording passed. See docs/review-0.2.0.md and release verification.

Plan 002 preserves the existing 140ms motion and adds only the focus/dismissal contract for the newly requested Preferences controls. Its installed behavior and feel checks remain pending.
