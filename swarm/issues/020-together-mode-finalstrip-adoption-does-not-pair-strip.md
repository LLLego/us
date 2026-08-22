---
status: fixed
domain: flows
severity: major
---

SYMPTOM
When the host finishes picking in together mode, the host sends `{ action: 'finalStrip', data: this.capturedImage }` (line 299) and the guest calls `showReveal()` to display the host's image (line 1541). The guest sees the host's strip and not a "joined" two-face composition. The shared reveal is the host's view, not a paired adoptation.

REPRO / EVIDENCE
- `js/app.js:298-300`:
  ```js
  if (this.mode === 'together' && this.dataConnection && this.dataConnection.open) {
    try { this.dataConnection.send({ action: 'finalStrip', data: this.capturedImage }); } catch(e) {}
  }
  ```
  This sends the host's strip, NOT a combined strip. There is no code path that merges host+guest strips before broadcasting.
- `js/app.js:1534-1541`:
  ```js
  } else if (data.action === 'finalStrip' && data.data) {
    this.capturedImage = data.data;
    ...
    this.showReveal();
  }
  ```
  The guest adopts the host's image wholesale.
- The `pair` layout IS the documented two-face flow, but its only "join" mechanism is `finalizePairCapture` (line 1060-1080), which only runs on the host and only when both parties have shot into `pairPartnerShots`. `pickPrint` (line 292-294) explicitly routes `currentLayout === 'pair'` to `finalizePairCapture` — but `currentLayout === 'pair'` is never reachable from chips (see issue 001), so this branch is dead in practice.
- Meanwhile for `strip-4`/`grid-2x2` (the layouts the user CAN actually pick in together mode), each side independently captures 8 of their own shots and picks 4 of their own; nothing merges them. The two people walk away with two different single-person strips.

EXPECTED
Together-mode users who picked `strip-4` or `grid-2x2` should see ONE shared strip that contains both their captures side-by-side, OR clearly told that each side's strip is individual-only.

ACTUAL
For the layouts actually reachable in together mode, each side produces and shares an independent single-person strip. The "finalStrip" handoff makes the guest view the host's image, but if the host expected a paired result they'll be confused (and vice-versa). The "two places, one frame" promise of the landing page (index.html:27) is not delivered by any reachable code path.

SUGGESTED FIX DIRECTION
Either (a) actually merge strips at `finalizePairCapture` time — host produces a combined canvas from `multiShots` + `pairPartnerShots` and sends THAT to the guest as `finalStrip`, or (b) rename the data action and document that "shared" means "watch your partner's reveal"; don't send the dataURL at all if the goal is just synchronous reveal entry.
## Fix notes (Lane 1)
The "final" definition now lives in the duo machine. New `finalReveal`
action (acked) is published by the host with the dataURL. The guest's
inbound handler routes through `_adoptPartnerReveal(dataURL)` which sets
`capturedImage` identically and calls `showReveal()`. Both peers reach
REVEALED with the SAME canvas. The old fire-and-forget `finalStrip` is
kept as a legacy path but is no longer the primary handoff. See
`duo-state.js` ACTION.FINAL_REVEAL and `_handleInbound()`.
