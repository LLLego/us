---
status: open
domain: deploy
severity: minor
---

## SYMPTOM
`js/frames-next.js` reads/writes `ctx.letterSpacing` (lines 123, 261) without feature-detection. The property is only supported in Chrome 99+, Edge 99+, and Safari 17.4+ — older Safari (still in use on iOS 15/16), Firefox, and most embedded webviews silently ignore it (acceptable) but where the runtime throws or sets `undefined`, the live date text will render with the default spacing instead of the template's intended tracking.

## REPRO / EVIDENCE
`js/frames-next.js` line 123:
```js
if (d.letterSpacing) {
  ctx.letterSpacing = d.letterSpacing + 'px'; // supported in modern engines; harmless if not
}
```
`js/frames-next.js` line 261:
```js
ctx.font = `${d.pill ? '700 ' : ''}${d.fontSize}px "Space Mono", monospace`;
```
The comment is correct — *writes* to `ctx.letterSpacing` are silently ignored on engines without the property. But the spec property is `ctx.letterSpacing` (string), and if the engine throws on setter (some older Safari builds), the surrounding `ctx.save()`/`ctx.restore()` is in a good state, so this is a low-severity visual-bug-concern rather than a crash.

## EXPECTED
Either feature-detect and gracefully no-op on engines that don't support `letterSpacing`, or pre-bake the date text as a single image (the rest of the deploy uses pre-rendered template PNGs).

## ACTUAL
The comment acknowledges the issue but doesn't feature-detect. On unsupported engines the date stamp will render with the original CSS-stack spacing, which may visibly mismatch the pre-rendered template design.

## SUGGESTED FIX DIRECTION
Add a guard:
```js
if (d.letterSpacing && 'letterSpacing' in CanvasRenderingContext2D.prototype) {
  ctx.letterSpacing = d.letterSpacing + 'px';
}
```
Or cache-engine a once-per-app boolean. Apply the same pattern at lines 123 and 261.
