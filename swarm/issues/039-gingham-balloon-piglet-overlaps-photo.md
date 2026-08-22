---
status: resolved
domain: frames
severity: major
---

## RESOLUTION (Lane 5, 2026-08-22)
Fixed by `safe_char_width()`. gingham widths: grid/duo-grid 219→202,
pair 198→189, single 219→216, strip/duo-strip unchanged. Tall portrait
asset (W/H=0.719) needed the cap to clear the 95% line cleanly.

## SYMPTOM
On the **gingham** (Special Moment) design, the `pooh-balloon-piglet.png`
character art overflows the 95% band cap in 4 of 6 layouts, landing 3–13px
inside the first photo slot in the grid, duo-grid, single, and pair layouts.

## REPRO / EVIDENCE

Emitter `C:/Users/legof/Desktop/us/frames-next/build_frames.py:450`:

```python
ch = {"strip": (185, "top:20px", "right:26px"), "grid": (219, "top:8px", "right:44px"),
      "single": (219, "top:8px", "right:48px"), "duo-strip": (185, "top:20px", "right:26px"),
      "duo-grid": (219, "top:8px", "right:44px"), "pair": (198, "top:8px", "right:44px")}[g["layout"]]
```

Asset dimensions (`pooh/pooh-balloon-piglet.png`): **647 × 900** (W/H = 0.719,
tall portrait — Pooh holding balloon with Piglet above).

| layout    | width | top | rendered height | bottom | slot_top | overlap |
|-----------|-------|-----|-----------------|--------|----------|---------|
| strip     | 185   | 20  | 257.3           | 277.3  | 280      | ok |
| duo-strip | 185   | 20  | 257.3           | 277.3  | 280      | ok |
| grid      | 219   | 8   | 304.6           | 312.6  | 300      | **+12.6px** |
| duo-grid  | 219   | 8   | 304.6           | 312.6  | 300      | **+12.6px** |
| single    | 219   | 8   | 304.6           | 312.6  | 320      | ok (within band) |
| pair      | 198   | 8   | 275.4           | 283.4  | 280      | **+3.4px** |

## EXPECTED
No character bottom past `slot_top - 5`.

## ACTUAL
grid +12.6, duo-grid +12.6, pair +3.4 — all bleed into the photo slot.

## SUGGESTED FIX DIRECTION
Cap widths: for grid/duo-grid `219 → floor(285 × 0.719) = 205`; for pair
`198 → floor(266 × 0.719) = 191`.
