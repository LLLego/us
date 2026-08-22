---
status: fixed
domain: flows
severity: major
---

SYMPTOM
In together mode, when the user taps "RETAKES" on the pick screen, only the local side resets; the partner is never notified and stays on whatever screen they were on (pick screen, reveal, stage) with stale state.

REPRO / EVIDENCE
- `js/app.js:273-282` `pickRetake()`:
  ```js
  this.multiShots = [];
  this.sessionShots = [];
  this.pickedIndices = [];
  this.multiShotInProgress = false;
  this.multiShotCancelled = false;
  this.showScreen('stage');
  setTimeout(() => this.initFrameOverlay(), 100);
  ```
  No `dataConnection.send(...)` to the partner. No new sync action exists for "retake" in `setupDataConnection`'s `conn.on('data', ...)` switch (lines 1530-1552). Only `sharedTick`, `finalStrip`, `pairShot`, `capture`, `setFrame`, `setLayout` are handled — none of which model a coordinated retake.
- `pickPrint` (line 284-308) also has no dual-side coordination for `strip-4`/`grid-2x2`: only `pair` layout triggers `finalizePairCapture`, which itself is unreachable in practice (issue 001).

EXPECTED
In together mode, when the host taps RETAKES, both sides return to the stage together (with pose-prompt countdowns still synced via the existing `requestSyncedCapture` path). When the guest taps RETAKES, the host is similarly notified.

ACTUAL
Only the tapper resets. The other party is left on the pick screen with stale `sessionShots`, stale `multiShotInProgress=false`, and no way to know what happened. If they later tap "PRINT THE STRIP", `pickPrint` proceeds with their stale session, producing a stale reveal that doesn't match the other side's retake. If they tap RETAKES later, ditto. There is no convergence.

SUGGESTED FIX DIRECTION
Add a new wire action (e.g., `retakeAll`) sent to the partner when the user taps RETAKES in together mode. On receipt, the partner runs the same `pickRetake()` cleanup. Same for `pickPrint` so both sides commit to the reveal simultaneously.
## Fix notes (Lane 1)
`pickRetake()` now routes through `this.duo.requestRetake()`, which sends
an acked `retakeAll` message to the partner. The partner's inbound
handler calls `_handlePartnerRetake()` which clears its session state and
returns to STAGE. Both peers arrive at the stage with `sessionShots`
preserved per the existing `capture(fromChain)` chain token
(`_captureChainActive` is NOT touched — only the user-facing session
state is reset). Symmetric: works regardless of which peer initiated.
