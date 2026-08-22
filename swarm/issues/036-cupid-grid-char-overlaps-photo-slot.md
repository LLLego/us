---
status: resolved
domain: frames
severity: major
---

## RESOLUTION (Lane 5, 2026-08-22)
Fixed by introducing `safe_char_width(layout, asset_path, requested_width)` in
`frames-next/build_frames.py`. Helper resolves real PNG aspect ratio from disk
and caps the requested width so rendered height ≤ 0.94 × HEAD (with a 1% safety
margin to absorb `int()` rounding — the 0.95 line was tight enough that one
asset rounded 1.8px over). All 17 designs × 6 layouts are now routed through
this helper uniformly, not just the broken ones — regression-proof.

For cupid grid: 741 → 687 (cupid pair 700 → 641; single unchanged at 733).
All cupid layouts now clear the slot. See `LANE5-REPORT.md`.

## SYMPTOM
On the **cupid** design (any layout with HEAD=300 except strip/duo-strip), the
`pucca-shy-bow.png` character art extends down past the top of the first photo
slot, partially covering the photo well and bleeding onto the user's photo.

## REPRO / EVIDENCE

Emitter source `C:/Users/legof/Desktop/us/frames-next/build_frames.py:272`:

```python
ch = {"strip": (265, "top:6px", "right:26px"), "grid": (741, "top:8px", "right:40px"),
      "single": (741, "top:8px", "right:44px"), "duo-strip": (265, "top:6px", "right:26px"),
      "duo-grid": (700, "top:8px", "right:36px"), "pair": (700, "top:8px", "right:36px")}[g["layout"]]
```

Asset dimensions (`pucca/pucca-shy-bow.png`): **900 × 369** (W/H = 2.439).

Computed rendered height per layout (width ÷ aspect):

| layout  | width | top | rendered height | bottom | slot_top | overlap |
|---------|-------|-----|-----------------|--------|----------|---------|
| grid    | 741   | 8   | 303.8           | 311.8  | 300      | **+11.8px** |
| duo-grid| 700   | 8   | 287.0           | 295.0  | 300      | ok |
| single  | 741   | 8   | 303.8           | 311.8  | 320      | ok (within band) |
| pair    | 700   | 8   | 287.0           | 295.0  | 280      | **+15.0px** |

Horizontal positioning: `right:40px` (grid/single) and `right:36px` (duo-grid/pair)
puts the char's right edge at x = W − 36/40, which for the affected layouts
(1560 wide grid, 1800 wide pair) places the char entirely inside the photo
column (slot.right = x_pad + slot.w covers that region). The overlap is
**on top of the photo slot**, not just into the dead band.

## EXPECTED
Character art bottom should be ≤ slot_top (HEAD band height) — so it never
covers the first photo well. Hard cap: rendered height + top ≤ HEAD.

## ACTUAL
Two of six layouts (`grid`, `pair`) place the char bottom 11.8–15px inside the
first photo slot. Photo will be visibly obscured.

## SUGGESTED FIX DIRECTION
Either reduce the char width so rendered height ≤ HEAD − top (≈ 285 for grid),
or shift the `top:` up so the char's bottom clears the slot. Quick fix: cap
`ch[0]` to `min(ch[0], HEAD × 0.95 × aspect)` where aspect = asset.width /
asset.height. E.g. for grid/pair of cupid: max width = 285 × 2.439 ≈ 695.
