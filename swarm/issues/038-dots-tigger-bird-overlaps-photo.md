---
status: resolved
domain: frames
severity: major
---

## RESOLUTION (Lane 5, 2026-08-22)
Fixed by `safe_char_width()`. dots widths: grid 526→489, duo-grid 500→489,
pair 485→456, single 526→521, strip/duo-strip unchanged. `tigger-bird.png`
is wide-angle (W/H=1.734) — even small width changes eat a lot of vertical
band. Pair is now safely under cap.

## SYMPTOM
On the **dots** (Film Club) design, the `tigger-bird.png` character art is sized
so wide (W=526/500 in grid/duo-grid) that its bottom edge intrudes 5–10px
into the first photo slot.

## REPRO / EVIDENCE

Emitter `C:/Users/legof/Desktop/us/frames-next/build_frames.py:352`:

```python
ch = {"strip": (260, "top:10px", "right:28px"), "grid": (526, "top:6px", "right:44px"),
      "single": (526, "top:6px", "right:48px"), "duo-strip": (260, "top:10px", "right:28px"),
      "duo-grid": (500, "top:6px", "right:40px"), "pair": (485, "top:6px", "right:40px")}[g["layout"]]
```

Asset dimensions (`pooh/tigger-bird.png`): **1970 × 1136** (W/H = 1.734,
wide-angle horizontal scene — Tigger stretching).

| layout    | width | top | rendered height | bottom | slot_top | overlap |
|-----------|-------|-----|-----------------|--------|----------|---------|
| strip     | 260   | 10  | 149.9           | 159.9  | 280      | ok |
| duo-strip | 260   | 10  | 149.9           | 159.9  | 280      | ok |
| grid      | 526   | 6   | 303.3           | 309.3  | 300      | **+9.3px** |
| duo-grid  | 500   | 6   | 288.3           | 294.3  | 300      | ok |
| single    | 526   | 6   | 303.3           | 309.3  | 320      | ok |
| pair      | 485   | 6   | 279.7           | 285.7  | 280      | **+5.7px** |

The grid layout's 526px width on a portrait-tall band makes the rendered
height 303.3px — past the 95% cap (285px).

## EXPECTED
Width chosen so rendered height ≤ 0.95 × band (= 285 for grid, = 266 for pair).

## ACTUAL
grid +9.3px overlap, pair +5.7px overlap. Both have the tigger/bird scene
visibly poking onto the user's first photo.

## SUGGESTED FIX DIRECTION
Cap `grid` width to `floor(285 × 1.734) = 493` and `pair` width to
`floor(266 × 1.734) = 461`. Or, since the asset is wide (W/H > 1.7), prefer
a smaller width and let the tigger crop in.
