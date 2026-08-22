---
status: fixed
domain: frames
severity: critical
---

## SYMPTOM
When the user picks the **pair** layout (a "two-strips-side-by-side" frame
intended for a 2-person together session), the app captures **8 photos**
locally before it stops. The emitter defines pair as **8 slots** (4 on the
user's side, 4 on the partner's side). The partner's side is filled by
remote sync (`pairShot` messages), so the local capture should be **4**.

## REPRO / EVIDENCE

`js/frames.js:12` declares:

```js
const LAYOUTS = {
  ...
  'pair': { name: 'Pair Strip', shots: 4, description: '...', duoOnly: true, pair: true },
};
```

`js/app.js:203-209` computes target shots:

```js
shotsNeededForLayout(layoutKey) {
  const layout = (typeof LAYOUTS !== 'undefined') ? LAYOUTS[layoutKey] : null;
  if (!layout || layout.shots <= 1) return 1;
  return layout.shots * 2;   // <-- always doubles, even for pair
}
```

Result for pair: `4 * 2 = 8` target shots.

But `templates.json` records `pair` as having `shots: 8` (a left strip of 4 +
a right strip of 4), and the emitter (`build_frames.py:52-60`) defines pair
exactly that way. **One user fills their half; the other fills theirs via
peer sync** — `js/app.js:948` sends `pairShot` to the peer, and the peer's
session accepts the remote shot at line 1542. So each user should only need
to capture 4 shots (their own half).

The bug: the local chain stops at 8 because `targetShots = 8`. The user is
forced to capture 8 photos even though 4 of them are redundant (the partner
is already sending their own 4). The "pick-your-best" mode (multi-shot with
2× multiplier) only makes sense for solo layouts where one user needs more
options to fill their slots. For `pair`, the multiplier is wrong.

Compare with `duo-strip` (`LAYOUTS['duo-strip'].shots = 4`): this layout also
has 4 slots but it is **single-user** (not split between two people), so
the 2× multiplier = 8 captures-to-pick-4 is correct there. The same logic
applies to `duo-grid` (2 slots). So the fix is **layout-specific**: pair
should NOT be doubled.

## EXPECTED
`shotsNeededForLayout('pair')` returns `4` (one user's share), not `8`.

## ACTUAL
`shotsNeededForLayout('pair')` returns `8` because of the unconditional
`layout.shots * 2`.

## SUGGESTED FIX DIRECTION
Modify `shotsNeededForLayout` to skip the `* 2` when the layout has the
`pair: true` flag:

```js
shotsNeededForLayout(layoutKey) {
  const layout = (typeof LAYOUTS !== 'undefined') ? LAYOUTS[layoutKey] : null;
  if (!layout || layout.shots <= 1) return 1;
  if (layout.pair) return layout.shots;   // each side takes their own half
  return layout.shots * 2;
}
```

Also audit line 875's hard-coded ternary:

```js
sbc.textContent = `SHOT ... OF ${this._targetShots || (this.currentLayout === 'single' ? 1 :
              this.currentLayout === 'grid-2x2' ? 8 : 8)} · ${count}`;
```

`grid-2x2 ? 8 : 8` is a degenerate ternary — both branches are 8. For pair,
this also reads 8 (the second branch). It should pass through to
`shotsNeededForLayout` consistently.
## Fix notes (Lane 1)
`shotsNeededForLayout()` now branches on `layout.pair`: pair layouts
return `layout.shots` (one user's share) instead of `layout.shots * 2`.
Each peer captures 4 of their own photos; the partner's 4 come in via
`pairShot` (acked through the duo machine). Also fixed the dead
`grid-2x2 ? 8 : 8` ternary in `countdown()`'s shot-badge line — replaced
with a consistent call to `this._targetShots || shotsNeededForLayout()`
which honours the pair branch. The degenerate ternary is gone.
