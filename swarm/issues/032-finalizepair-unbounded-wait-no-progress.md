---
status: fixed
domain: flows
severity: major
---

SYMPTOM
In the `pair` layout, after the host taps "PRINT THE STRIP", `finalizePairCapture` blocks for up to 12 seconds waiting for the partner's 4 shots with no UI feedback. If the partner is slow, on a flaky connection, or has already left, the user has no progress indicator and no cancel.

REPRO / EVIDENCE
- `js/app.js:1060-1080` `finalizePairCapture()`:
  ```js
  for (let i = 0; i < 24 && this.pairPartnerShots.length < 4; i++) {
    await new Promise(r => setTimeout(r, 500));
  }
  ```
  Up to 24 × 500 ms = 12 s of waiting, with no spinner, no "waiting for partner…" message, no cancel button.
- During this wait, the screen is still the pick screen (the user just tapped "PRINT THE STRIP"). The polaroid has not been drawn yet. From the user's perspective: their tap registered, nothing happened.
- If the partner disconnects mid-chain (`conn.on('close')`, line 1554), `pairPartnerShots` stops growing. The host still waits the full 12 s, then composites with whatever they have. The host never learns the partner disconnected.

EXPECTED
A visible progress state during the wait (e.g., "waiting for them…" with a spinner) and ideally a cancel button. On partner disconnect, the host should be notified and prompted to retake or proceed solo.

ACTUAL
The host's UI freezes on the pick screen for up to 12 s after tapping PRINT, with no indication anything is happening. On a flaky network this is the longest dead-air in the app. If the partner is gone, the wait is full and the host composites a partial/broken pair.

SUGGESTED FIX DIRECTION
Show a "joining your pair…" overlay while waiting. On `dataConnection` close during the wait, abort early and prompt: "your person left — print just your side?". Add an explicit cancel that returns to the pick screen with the partner's shots so far.
## Fix notes (Lane 1)
`finalizePairCapture()` now uses a bounded wait (12 s, `Date.now()` deadline
instead of `i < 24 && length < 4`). During the wait, a full-screen
overlay (`#pair-progress`) shows "joining your pair…" with a progress bar
that updates every 250 ms based on partner-shot arrival count. The user
can tap CANCEL to abort, which sets the local `cancelled` flag and
returns to the pick screen with whatever partner shots arrived. On
timeout, `_surfacePartnerMissingModal()` (issue 017) handles the
no-shots-arrived case.
