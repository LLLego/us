---
status: open
domain: deploy
severity: minor
---

## SYMPTOM
`js/stickers.js` defines an async `drawSticker(ctx, name, x, y, size)` function that is never called from anywhere in the codebase. It is dead code that ships to every visitor, costs ~13 lines and ~30 chars of bundle, and may confuse future readers.

## REPRO / EVIDENCE
`js/stickers.js` lines 92–97:
```js
async function drawSticker(ctx, name, x, y, size) {
  const img = await getSticker(name);
  if (img) {
    ctx.drawImage(img, x - size/2, y - size/2, size, size);
  }
}
```
Cross-reference:
- `grep -R 'drawSticker(' js/ css/ *.html` → only matches *the definition itself* (line 92).
- `frames.js` only calls `drawStickerSync(ctx, name, x, y, size)` everywhere it draws a sticker (e.g. `frames.js:385–388`, `412–416`, `430–432`, `462–467`, `490–493`, `519–522`, `542–547`, `569–573`).
- `stickerCache` is pre-populated by `preloadStickers()` (called from `app.init()` at `js/app.js:67`), so `drawStickerSync` always resolves.

## EXPECTED
Only one `drawSticker` function exists — the synchronous cache-aware one. No async variant duplicates the contract.

## ACTUAL
The async variant is shipped but never invoked. Persons reading the file may assume the async version is the "correct" one and edit it, leaving the synchronous caller broken.

## SUGGESTED FIX DIRECTION
Either (a) delete the async `drawSticker` function (lines 92–97 of `js/stickers.js`), or (b) replace all `drawStickerSync` callsites with `drawSticker` and adjust the surrounding `await` chains. Either is a one-commit change.
