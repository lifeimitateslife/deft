# 001 Refine interface motion

- Status: IMPLEMENTED - packaged Windows appearance tests and native motion capture passed
- Commit: c837fe5
- Severity: MEDIUM
- Category: Interruptibility and physicality
- Scope: src/style.css, src/main.tsx, src/FormattingToolbar.tsx

## Audit

DEFT uses React and plain CSS. Buttons and tabs are frequent; Settings, Format and link dialogs are occasional. Existing transitions are 100-140ms. No perpetual motion, width/height animation, JS frame loops or whole-window opacity exist. Reduced motion retains instant state feedback. User explicitly requests restrained animations even for tab actions; that overrides the generic frequency exclusion.

Confirmed findings: src/style.css .notice has translateX(-50%) but reveal keyframes replace transform with translateY. Settings and Format unmount immediately, so exit has no motion and rapid toggles restart entrance. User requires motion to stay within 100-180ms, overriding the generic 200ms drawer budget.

## Target

Use --ease-out: cubic-bezier(0.23, 1, 0.32, 1), 140ms opacity and transform transitions. Preserve notice centering with the independent translate property. Use top-right origin for Settings and top-left for Format. Keep text/editor content unanimated. For Settings and Format use native CSS display transitions with transition-behavior: allow-discrete and @starting-style, rendering the shell persistently with hidden when closed. Add Escape, outside dismissal and focus return for Settings; prevent hidden panels capturing events or focus. Maintain all existing controls and live settings state. No new libraries.

## Verification

Build and native tests must pass. Rapid open/close should leave no invisible overlays. Keyboard Escape returns to the trigger. Reduced motion must remove position changes and exit delay. Capture actual native UI opening/closing as a short video and inspect frames at reduced playback. Existing root reduced-motion overrides remain authoritative.

## Boundaries

Only specified UI files. Do not touch persistence, editor, formatting transforms or installer. No redesign, no document animation, no tests run concurrently with the main agent's native tests. If the code differs materially, report before changing it.
