---
status: resolved
domain: frames
severity: major
---

## RESOLUTION (Lane 5, 2026-08-22)
Fixed by `safe_char_width()` applied uniformly. poohhug pair: 300→273.
poohhug grid/duo-grid: 300→293 (was within cap at 300 × 1.04 = 312 — but the
helper still trims to 0.94 × 300 × 1.04 = 293 for consistency with the
project's band-fill rule). All other (design, layout) combinations verified
zero-overflow after the fix.

## SYMPTOM
Beyond the four designs called out individually, three more designs have
character art that **exceeds the 95% band height cap** defined as the rule
for the project's geometry audit, though not all of them cross into the
photo slot. This is a separate concern: even when the photo slot isn't yet
occluded, the cap is documented as a hard rule and several placements
violate it. Most are still safe from photo-overlap, but a few (cupid grid,
cupid pair, dots grid, dots pair, gingham grid, gingham duo-grid, gingham
pair, purikura strip / duo-strip / grid / duo-grid / pair) ARE in the
photo, and are covered by issues 001–004 individually.

## REPRO / EVIDENCE

Cross-product of all 17 designs × 6 layouts vs the 95% band-cap rule, using
real asset aspect ratios from `C:\Users\legof\Desktop\us\assets\characters\`
PNG dimensions (read via System.Drawing.Image):

```
ASSET W/H                   strip  duo-strip  grid  duo-grid  single  pair
pooh/pooh-wave.png   0.703   ok     ok        0.0    0.0      +0.5    +0.1
pooh/pooh-hug-piglet 0.723   ok     ok        0.0    0.0      +0.1    ok
pooh/pooh-heart      0.588   ok     ok        0.0    0.0      +0.6    ok
kitty/kitty-cloud    0.907   ok     ok        0.0    0.0      +0.3    ok
pucca/pucca-smile    1.500   ok     ok        +0.3   +0.3      ok     ok
pucca/pucca-peace    2.528   ok     ok        +0.2   +0.2      ok     ok
pucca/pucca-shy-bow  2.439   ok     ok       +18.8  +2.0      -0.2   +21.0   <- cupid (issue 001)
kitty/kitty-flowers  0.873   +9.0   +9.0    +17.7  +17.7      ok     +9.0   <- purikura (issue 002)
pooh/tigger-bird     1.734   ok     ok        +9.3  +3.3       -0.7  +5.7   <- dots (issue 003)
pooh/pooh-balloon    0.719   ok     ok       +12.6  +12.6      -7.4  +3.4   <- gingham (issue 004)
pooh/pooh-gang-hug   1.040   ok     ok        +3.4  +3.4      -15.6 +22.4  <- poohhug (pair covered here)
```

(Each cell shows rendered-height-overage vs 95% band cap in pixels;
`+` = overflows cap; `ok` = within cap.)

So per-asset-aspect-ratio violations:
- **poohhug pair**: +22.4px (covers photo slot — see below)
- **cupid grid/pair**: +18.8/+21.0 (issue 001)
- **purikura**: +9 to +17.7 (issue 002)
- **dots grid/pair**: +9.3/+5.7 (issue 003)
- **gingham grid/duo-grid/pair**: +12.6/+12.6/+3.4 (issue 004)

The remaining **poohhug pair** case (asset `pooh/pooh-gang-hug.png`,
2544×2446, W/H=1.040) — width 300, height = 288.4. Top 8, bottom 296.4.
slot_top = 280. **Overlap = 16.4px onto the first photo slot of the user's
side.** Not yet covered by another issue.

## EXPECTED
Every (design, layout) combination satisfies `rendered_height + top ≤ 0.95 × HEAD`.

## ACTUAL
5 designs (cupid, purikura, dots, gingham, poohhug) violate this rule in at
least one layout. Four of them have at least one layout where the char
visibly intrudes onto the photo slot. poohhug pair is the sixth and was
missed in earlier coverage.

## SUGGESTED FIX DIRECTION
Apply the band-cap rule uniformly in the emitter. A single helper function
that takes `(layout, asset_path, width)` and returns the safe width would
prevent regressions:

```python
def safe_char_width(layout, asset_path, requested_width):
    aw, ah = ... # load from disk
    aspect = aw / ah
    head = GEO[layout]['HEAD']
    return min(requested_width, int(head * 0.95 * aspect))
```

Then `ch = {lay: (safe_char_width(lay, asset, requested), top, right) for lay in LAYOUTS}`.

For poohhug pair: requested 300 → cap to `floor(280 × 0.95 × 1.040) = 276`.
