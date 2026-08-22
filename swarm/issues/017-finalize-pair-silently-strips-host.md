---
status: fixed
domain: js-engine
severity: major
---

# `finalizePairCapture` rejects silently if partner never sends pairShot — host loses entire capture with no UX fallback

## SYMPTOM
In `pair` layout, the host calls `finalizePairCapture` which polls for 24 × 500 ms (12 s) waiting for the partner's shots. If the partner's data connection drops mid-session or they never send `pairShot`, the polling loop exits with `pairPartnerShots.length < 4`. The composite then uses fallback images (`mine[mine.length-1] || theirs[0]`) to pad to 8, producing an ugly duplicate-image strip. No retry prompt, no error.

## REPRO / EVIDENCE
- File: `js/app.js`
- Lines 1060–1080:
  ```js
  async finalizePairCapture() {
    const mine = [...this.multiShots.length ? this.multiShots : this.sessionShots];
    this.pairPartnerShots = this.pairPartnerShots || [];
    for (let i = 0; i < 24 && this.pairPartnerShots.length < 4; i++) {
      await new Promise(r => setTimeout(r, 500));
    }
    const theirs = this.pairPartnerShots.slice(0, 4);
    const isHost = this.isHost;
    const ordered = isHost
      ? [...mine, ...theirs, ...Array(Math.max(0, 8 - mine.length - theirs.length)).fill(mine[mine.length-1] || theirs[0])]
      : [...theirs, ...mine, ...Array(Math.max(0, 8 - mine.length - theirs.length)).fill(mine[mine.length-1] || theirs[0])];
    this.multiShots = ordered.slice(0, 8);
    try { await this.compositeMultiShot(); } catch (e) { console.warn('pair composite failed', e); }
    this.showReveal();
    ...
  }
  ```

### Failure timeline
1. Host and guest are connected in `pair` mode.
2. Host finishes 4 shots → calls `finalizePairCapture`.
3. Guest's connection drops (mobile network blip, browser backgrounded, OS suspended background tabs).
4. Guest's data connection `close` event at line 1554 fires, sets `dataConnection = null` and `updateStatus('', 'DISCONNECTED')`.
5. `finalizePairCapture` polls 24 times × 500 ms (12 s total). `pairPartnerShots` stays `[]`.
6. After 12 s, `theirs = []`. The fallback `Array(...).fill(mine[mine.length-1])` pads with the LAST host shot repeated 4×.
7. `compositeMultiShot` runs, host sees a strip with their 4 shots on the left and the same last shot duplicated 4× on the right.
8. Both peers eventually hit `showReveal` (host at line 1073; guest, if it had finished, would be in the same loop). Guest, meanwhile, never knew there was a problem — its own `finalizePairCapture` is still polling with `theirs = []` and `mine = []` (since guest hadn't taken its 4 shots yet OR was still mid-chain).

### Why no error surfaces
- Line 1064's loop has no timeout signal. The `try/catch` at line 1072 only catches composite failures. There's no check like `if (theirs.length === 0) { ... UX error ... }`.
- The fallback fill at line 1069–1070 is silent — produces the image, shows reveal, looks "successful" to the user.

## EXPECTED
- After the 12 s wait, if `theirs.length === 0`, surface a clear "your partner's photos didn't arrive" message with a RETRY option (re-poll, or proceed with just host shots).

## ACTUAL
- Always proceeds. Either silently duplicates the host's last shot 4× (host view) or shows an empty/sparse composite (guest view, if it gets there at all).

## SUGGESTED FIX DIRECTION
- After the poll loop, branch on `theirs.length === 0`: show a blocking modal with "We couldn't reach your partner" + RETRY / PROCEED-ALONE buttons. Retry should re-poll, not restart the capture chain.
- Also consider exposing `pairPartnerShots` progress to the UI during the 12 s wait so the host knows what's happening.
## Fix notes (Lane 1)
`finalizePairCapture()` now branches after the bounded wait on
`theirs.length === 0`. If the partner never sent any pairShots, an inline
modal surfaces: "we couldn't reach your person" with two buttons —
PRINT MY SIDE (proceed with host-only) or RETAKE (cancel and start over).
The fallback duplicate-padding (which produced the same-last-shot 4× strip)
is preserved as the inner code path ONLY when the user explicitly chose to
proceed. The duo machine owns the FINALIZING → REVEALED transition.
