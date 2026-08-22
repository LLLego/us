---
status: fixed
domain: flows
severity: critical
---

SYMPTOM
In duo ("together") mode the user has no way to pick `duo-strip`, `duo-grid`, or `pair` from the Layout chips. Even though those layouts are registered in `LAYOUTS` with `duoOnly: true`, they never appear, so together-mode captures always default to `strip-4` (single-frame per shot).

REPRO / EVIDENCE
- `js/app.js:41-84` `init()`: at boot, `this.mode = null`. `buildLayoutChips()` is called on line 54 BEFORE the user has tapped a mode card.
- `js/app.js:815-828` `buildLayoutChips()`:
  ```js
  for (const [key, l] of Object.entries(LAYOUTS)) {
        if (l.duoOnly && this.mode !== 'together') continue;
        ...
  }
  ```
  At the time this runs, `this.mode === null`, so the `continue` filters out every `duoOnly` entry (duo-strip, duo-grid, pair — `js/frames.js:10-13`). Only single/strip-3/strip-4/grid-2x2 are rendered.
- `setLayout()` re-evaluates `mode` (line 837: `if (ddef && ddef.duoOnly && this.mode !== 'together') key = 'strip-4'`), confirming duo layouts can only be set in together mode — but they're already invisible in the chip row.
- `buildFrameThumbnails` similarly only re-runs when the user opens the Looks sheet; nothing rebuilds the layout chips after `startTogether`/`joinRoom` sets `this.mode = 'together'`.

EXPECTED
A user in together mode sees the duo-strip / duo-grid / pair chips in the layout row so they can pick a two-face layout.

ACTUAL
Layout chips are built once at startup with `mode === null`, so duo chips never render regardless of mode. Together-mode captures are forced to `strip-4` (a single-frame strip), meaning both people are mashed into a tiny half-width half-height rectangle rather than side-by-side. The whole duo-specific UX is unreachable from the chip UI.

SUGGESTED FIX DIRECTION
Rebuild the layout chips (and any other mode-dependent chip row) at the moment `this.mode` becomes `'together'` — e.g., call `buildLayoutChips()` at the end of `startTogether()`, `joinRoom()`, `useDropFrame()` and the URL-driven auto-join branch in `init()`. Re-run on reconnect, and on leaving together mode, rebuild again for solo layouts.
## Fix notes (Lane 1)
Rebuilt layout chips at the moment `this.mode` becomes `'together'` — see
`startTogether()` (host + URL-join branches) and `joinRoom()`. Each call site
now invokes `this.buildLayoutChips()` after the camera starts so duo-strip /
duo-grid / pair chips appear on the layout row. Also rebuilt on every
CONNECTED transition via the duo machine's observer, so rejoin paths are
covered. The `setLayout()` defensive guard (`if duoOnly && mode !== together`)
remains as a safety net.
