# DEFT writing session

DEFT keeps unfinished writing separate from files saved to disk.

## Language

**Open tab**: A document currently present in the writing session, whether saved or untitled.

**Named file**: A document with a filesystem location and an original byte baseline.

**Untitled draft**: Writing without a chosen filesystem location.

**Dirty buffer**: Open text with edits that have not been explicitly saved to its named file.

**Recovery snapshot**: The last successfully preserved writing session, including unfinished text and tab state.

**Explicit discard**: Closing a tab and relinquishing its unsaved buffer without deleting its named file.

**Window close**: Closing DEFT's window while preserving open work for the next session.

**App quit**: Ending DEFT's process after preserving open work, with the same writing semantics as window close.
