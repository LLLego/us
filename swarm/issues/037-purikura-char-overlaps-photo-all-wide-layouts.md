---
status: resolved
domain: frames
severity: critical
---

## RESOLUTION (Lane 5, 2026-08-22)
Fixed by `safe_char_width()` cap. purikura widths: strip/duo-strip 240→229,
grid/duo-grid 265→246, pair 240→229, single 265→262. All layouts clear the
slot. `kitty-flowers-raise.png` aspect is 0.873 (portrait-tall) so the cap
hits especially hard — strip max width 280 × 0.94 × 0.873 = 229.

## SYMPTOM
On the **purikura** design, the `kitty-flowers-raise.png` character art bleeds
onto the first photo slot in **5 of 6 layouts** — strip, duo-strip, grid,
duo-grid, and pair. Single is the only layout that stays inside the band.

## REPRO / EVIDENCE

Emitter `C:/Users/legof/Desktop/us/frames-next/build_frames.py:304`:

```python
ch = {"strip": (240, "top:16px", "right:26px"), "grid": (265, "top:14px", "right:44px"),
      "single": (265, "top:14px", "right:48px"), "duo-strip": (240, "top:16px", "right:26px"),
      "duo-grid": (265, "top:14px", "right:44px"), "pair": (240, "top:14px", "right:44px")}[g["layout"]]
```

Asset dimensions (`kitty/kitty-flowers-raise.png`): **610 × 699** (W/H = 0.873,
i.e. portrait-tall — a tall flower-raising kitty).

| layout    | width | top | rendered height | bottom | slot_top | overlap |
|-----------|-------|-----|-----------------|--------|----------|---------|
| strip     | 240   | 16  | 275.0           | 291.0  | 280      | **+11.0px** |
| duo-strip | 240   | 16  | 275.0           | 291.0  | 280      | **+11.0px** |
| grid      | 265   | 14  | 303.7           | 317.7  | 300      | **+17.7px** |
| duo-grid  | 265   | 14  | 303.7           | 317.7  | 300      | **+17.7px** |
| single    | 265   | 14  | 303.7           | 317.7  | 320      | ok |
| pair      | 240   | 14  | 275.0           | 289.0  | 280      | **+9.0px** |

In every wide-ish layout the character's bottom edge sits inside the first
photo well by 9–18px. The strip variants are especially bad — char bottom
(291) sits squarely on top of the upper photo slot (y=280, h=560).

## EXPECTED
No character art should overlap a photo well. The geometry should be tuned so
rendered height + top ≤ HEAD band height (with the 95% band-cap rule stated
in the build's own comment block).

## ACTUAL
5/6 layouts have a 9–18px overlap of character onto the first photo slot.

## SUGGESTED FIX DIRECTION
For purikura, either (a) cap widths to keep rendered height ≤ 0.95 × band:
strip max width = 264 × 0.873 ≈ 230; grid max width = 285 × 0.873 ≈ 249;
or (b) reduce `top:` to negative values that push the char upward enough to
clear the slot top. Recommended: cap widths, since negative top shifts the
visible bbox upward and may clip above the frame.
