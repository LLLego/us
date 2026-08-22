---
status: open
domain: frames
severity: minor
---

## SYMPTOM
The app uses two different layout-key naming conventions in parallel,
creating two "raw" vocabularies that have to be translated by a bridge. The
older vocabulary (`strip-4`, `grid-2x2`) is what `LAYOUTS`, the layout chips,
the gallery, and `compositeMultiShot()` consume; the newer vocabulary
(`strip`, `grid`, `single`, `duo-strip`, `duo-grid`, `pair`) is what
`templates.json`, `frames/manifest.json`, and the emitter use. The
translator `FramesNext.layoutKey()` at `js/frames-next.js:27-33` covers the
gap but only one consumer uses it.

## REPRO / EVIDENCE

```
$ grep -RE '["\'](strip|strip-4|grid|grid-2x2|single|duo-strip|duo-grid|pair)["\']'
  --include=*.js --include=*.html --include=*.json .

frames/manifest.json:    ['duo-grid', 'duo-strip', 'grid', 'pair', 'single', 'strip']
gallery.html:            ['grid']
js/app.js:               ['duo-grid', 'duo-strip', 'grid-2x2', 'pair', 'single', 'strip-4']
js/frames-next.js:       ['duo-grid', 'duo-strip', 'grid', 'grid-2x2', 'pair', 'single', 'strip', 'strip-4']
js/frames.js:            ['duo-grid', 'duo-strip', 'grid-2x2', 'pair', 'strip-4']
templates/templates.json:['duo-grid', 'duo-strip', 'grid', 'pair', 'single', 'strip']
```

`app.js` and `frames.js` use the old keys (`strip-4`, `grid-2x2`) but
`templates.json` and `frames/manifest.json` use the new keys. The bridge
exists:

```js
// js/frames-next.js:27
layoutKey(appLayout) {
  if (appLayout === 'strip-4') return 'strip';
  if (appLayout === 'grid-2x2') return 'grid';
  ...
}
```

This works *only* when the consumer routes through `FramesNext`. But several
code paths still use raw app keys directly:
- `js/app.js:683-685` renders the strip-4 layout in the legacy canvas path
  (`compositeMultiShot`) using the `strip-4` literal.
- `js/app.js:1098, 1133` reference `'grid-2x2'` directly in branch tests.
- `js/app.js:875` uses `grid-2x2` in a ternary that determines target shots.

The dual vocabulary is fragile: a future change that adds e.g. `strip-3` or
`strip-5` would need updates in three places (LAYOUTS, LAYOUTS bridge,
emitter) and the bridge itself only knows the current six mappings.

## EXPECTED
One canonical layout vocabulary across the codebase. Either:

(a) Rename `strip-4 → strip` and `grid-2x2 → grid` everywhere, including
`LAYOUTS`, `app.js` branches, and `compositeMultiShot()`. The emitter and
templates.json stay as-is.

(b) Rename `strip → strip-4`, `grid → grid-2x2` everywhere in the emitter
and templates.json. The app stays as-is.

(a) is the smaller diff (5 sites in `app.js` + 1 line in `frames.js`) and
keeps the data layer aligned with the geometry in the emitter.

## ACTUAL
Two parallel vocabularies, bridge-translated only at `FramesNext.layoutKey`.
Legacy code paths (canvas composite, ternary targets, dead `strip-3` branch)
still use the old literals.

## SUGGESTED FIX DIRECTION
If choosing (a): update `LAYOUTS` keys in `js/frames.js:7-13`, then the
`currentLayout === 'strip-4' | 'grid-2x2'` branches in `js/app.js:685, 834,
837, 875, 1088, 1098, 1126, 1133` to use `strip` and `grid`. Delete the
now-redundant `layoutKey()` translator in `frames-next.js`.

If choosing (b): update the emitter's layout literals in
`build_frames.py` (`geo_for` keys, `for layout in (...)` loops) and the
template/manifest keys. Bigger diff, no functional change.
