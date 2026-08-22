# BATTLE PLAN — Fix Cycle 1 (Court-ratified, Aug 21)

**Verdict:** Court-strategized, Claude-coded, Hermes-hostile-verified. 4 execution lanes, batched briefs. Lane order below = execution order. Hermes verifies async/state class adversarially (timeline tracing); lint-level checks are delegated. Deploy is HUMAN-ONLY.

## Pre-triage outcomes (Hermes, verified)
- Issue 007 (supabase key) = FALSE POSITIVE — placeholder string, wontfix.
- Issue 019 (repo bloat 276MB) = REAL but it's .git HISTORY (585MB pack), not working tree. Hermes-owned cleanup, human-approved, AFTER lanes ship. Not delegated.

## LANE 1 — DUO STATE MACHINE (root-cause battle plan) — CRITICAL
Issues: 001, 003, 005, 008, 009, 014, 017, 020, 023, 025, 030, 032, 041
Court diagnosis (unanimous): missing unified duo-session state contract — peers mutate local state fire-and-forget, no handshake/ack, no shared definition of "final". Fix the contract ONCE; symptoms collapse.
Approach: Claude Code implements an explicit duo state machine (states, transitions, ack protocol, final-strip ownership, retake sync, orphan cleanup), then derives chips/finalStrip/retake/drop-frame flows from it.
VERIFICATION: Hermes — two-peer E2E + timeline-sampled state traces on retake/drop-frame/orphan paths. Claude's self-checks are inadmissible for this lane.

## LANE 2 — LEAKS + iOS SAVE — MAJOR
Issues: 027 (iOS download silent fail + no instruction), 034 (objectURL leak), 022 (framepreview canvas leaks), 018 (peerdestroy after disconnect — folds into Lane 1 if touchy), 035 (prefers-reduced-motion)
VERIFICATION: Hermes spot-check + code diff audit. Mostly mechanical.

## LANE 3 — CSS/UI NITS — MAJOR/MINOR
Issues: 004 (WCAG white-on-pastel), 011, 013, 015, 021, 028, 029, 031, 033, 006
VERIFICATION: measurement battery across viewport matrix + vision audit of fixed screens only.

## LANE 4 — HYGIENE — MINOR
Issues: 002 (gallery cache-busters), 024 (unreferenced char assets — CROSS-CHECK vs Lane 5 needs first), 026 (dead drawSticker), 012 (strip-3 ghost), 042 (layout-key naming)
VERIFICATION: grep/diff audit, quick.

## LANE 5 — FRAME GEOMETRY (EMITTER, SEPARATE REPO) — CRITICAL
Issues: 036, 037, 038, 039, 043 (+ 010 decor minor, 040 stale thumbs)
Root cause: craft-frame char placements written per-layout by hand, never passed through the 95% band-cap rule. Fix = the `safe_char_width()` helper in build_frames.py (issue 043 has the exact code), applied to cupid/purikura/dots/gingham/poohhug, then FULL pipeline: build → render_audit → make_templates → thumb resize → wall+gallery regen.
VERIFICATION: geometry-regex audit pre-build + full-size renders + sweep.

## Hard constraints (ALL lanes)
1. Preserve every element ID the engine touches (see skill ui-v2 contract).
2. Frames/templates are EMITTED — never hand-edit us-temp/frames or templates.
3. No SVG characters, no emoji glyphs, characters in bands only.
4. Bump ?v= in index.html on any asset change.
5. One lane = one branch/commit batch. NO git history operations, NO pushes (Hermes+user only).
6. Playwright fake-cam flags: --use-fake-device-for-media-stream --use-fake-ui-for-media-stream.

## Execution order
Lane 5 (emitter, independent) can run PARALLEL with Lane 1. Lanes 2+3 after Lane 1 lands (they touch app.js too). Lane 4 last.
