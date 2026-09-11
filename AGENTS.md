# DEFT

Electron owns native operations in `desktop/`. React and CodeMirror own the interface in `src/`. Documents retain one exact source string; editor changes are applied as targeted patches. Rendered Markdown is never the saved representation.

Commands: `npm ci`, `npm test`, `npm run build`, `npm start`, `npm run test:ui`, `npm run package`.

Never normalize an opened document. Reject lossy encoding. Check disk content before replacing files. Preserve symlinks by resolving their targets. Keep recovery until safe save or explicit discard. No document bodies in logs. Native operations must validate the sender and document identity. No runtime network requests or renderer Node access.

Use synthetic fixtures. Keep task scratch inside `.scratch/`. Do not add co-author trailers or change global Git identity. First-party prose uses ordinary hyphens, not em dashes.
