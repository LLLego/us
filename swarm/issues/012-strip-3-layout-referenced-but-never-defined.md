---
status: open
domain: deploy
severity: minor
---

## SYMPTOM
`js/app.js` has a rendering branch (`compositeMultiShot`, lines 1093–1097 and 1126–1132) for a `currentLayout === 'strip-3'` case, but `LAYOUTS` in `js/frames.js` (lines 6–13) never declares a `strip-3` entry. The branch is dead code that ships as part of the bundle and can silently render an unreadable strip if some legacy code path sets `currentLayout = 'strip-3'`.

## REPRO / EVIDENCE
`js/frames.js` lines 6–13:
```js
const LAYOUTS = {
  single: { name: 'Single', shots: 1, description: 'One photo' },
  'strip-4': { name: 'Strip 1×4', shots: 4, description: 'Classic vertical strip' },
  'grid-2x2': { name: 'Grid 2×2', shots: 4, description: 'Four photos in a square' },
  'duo-strip': { name: 'Duo Strip', shots: 4, description: 'Wide two-face strip', duoOnly: true },
  'duo-grid': { name: 'Duo Wide', shots: 2, description: 'Two wide two-face rows', duoOnly: true },
  pair: { name: 'Pair Strip', shots: 4, description: 'Two strips side by side — you each take your side', duoOnly: true, pair: true },
};
```
`js/app.js` lines 1093–1097:
```js
} else if (this.currentLayout === 'strip-3') {
  const gap = 16;
  const cellW = W - gap * 2;
  const cellH = Math.round(cellW * 5 / 4);
  H = cellH * 3 + gap * 4;
}
```
`js/app.js` lines 1126–1132:
```js
if (this.currentLayout === 'strip-4' || this.currentLayout === 'strip-3') {
  const cellH = (H - gap * (shots.length + 1)) / shots.length;
  …
}
```
Cross-reference: `grep -R 'strip-3' js/ css/ *.html` shows references only in `js/app.js` — never in `frames.js`, never in `templates.json`, never in `index.html`. `currentLayout` is initialised to `'single'` (`js/app.js:20`) and only mutated by layout-chip clicks (which loop over `LAYOUTS` entries — `strip-3` is not in the loop).

## EXPECTED
Either `LAYOUTS` declares a `strip-3` entry (and `templates/templates.json` includes a `strip-3` variant for each themed frame), or the `strip-3` references in `js/app.js` are removed.

## ACTUAL
Six lines of dead code in `compositeMultiShot` reference a layout that cannot be selected from the UI. If a future migration introduces `strip-3` it will get the wrong number of photo slots (the branch uses `cellH * 3`, but `strip-3` semantically should render 3 shots, not 3 cells computed dynamically from `shots.length`).

## SUGGESTED FIX DIRECTION
Delete the `strip-3` cases in `compositeMultiShot` (lines 1093–1097 in the height-computation block, line 1126 of the draw block) and the `|| strip-3` branch in line 1126.
