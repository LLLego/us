#!/usr/bin/env bash
# Reporter: headless Claude Code audit pass. Writes issues to swarm/issues/.
# Usage: bash swarm/report.sh <domain>
# Domains: css-ui | js-engine | frames | flows | deploy
set -uo pipefail
cd "$(dirname "$0")/.."
DOMAIN="${1:?usage: report.sh <css-ui|js-engine|frames|flows|deploy>}"
mkdir -p swarm/issues
N=$(ls swarm/issues 2>/dev/null | wc -l | tr -d ' ')
START=$(printf '%03d' $((N+1)))

case "$DOMAIN" in
css-ui) BRIEF="You are a harsh senior product designer doing a UI/CSS audit of this photobooth PWA (sticker-machine design system, 7 data-themes, fluid sizing, mobile-first). Audit main.css + index.html structure: theme variable completeness across all 7 themes (any var referenced but missing in a theme = bug), tap-target sizes, specificity traps (#id vs .class vs .screen display), clamp() units sanity (no unitless*px math), safe-area handling, z-index collisions, dead CSS, contrast of ink-on-paper per theme. REPRODUCE claims: for CSS claims cite the exact rule; where possible reason from the computed cascade.";;
js-engine) BRIEF="You are a harsh senior JS engineer auditing app.js + js/*.js of this photobooth PWA. Hunt: async races (capture chains, setTimeout vs promise ordering, unawaited composites), state reset bugs (arrays cleared in recursive steps), silent catch blocks that swallow errors, event listeners that can double-fire, PeerJS duo edge cases (data-channel message handling, guest stranding), memory leaks (object URLs, canvas refs). Cite exact line numbers and explain the failure mode as a repro timeline.";;
frames) BRIEF="You are auditing the frame system. Source of truth is the EMITTER at C:/Users/legof/Desktop/us/frames-next/build_frames.py (read it from there; us-temp/templates is build OUTPUT, never hand-edit). Cross-check templates/templates.json geometry against app expectations: every design has all 6 layouts, slot rects inside frame bounds, character art capped at 95% of band height per asset aspect ratio, no art over photo slots, app-layout keys vs raw keys consistency. Also check thumbnails exist and are reasonably sized for every frame.";;
flows) BRIEF="You are a QA engineer auditing the USER FLOWS of this photobooth PWA by reading the code end-to-end (app.js): landing -> solo booth -> capture chain (8 shots w/ pose prompts) -> pick-best-four -> print/reveal -> save (incl. iOS download path) -> gallery; duo: host/guest join, frame sync, pair-strip exchange, finalStrip adoption; monthly drop flow; theme switching persistence. Find broken or fragile transitions, unreachable states, error paths that dead-end (no retry), iOS-specific hazards. You may NOT run a browser; reason from code with line cites.";;
deploy) BRIEF="You are a release engineer auditing deploy hygiene of this repo (GitHub Pages, push=deploy). Check: cache-buster ?v= consistency across index.html asset links (any link missing a bump-able version?), repo bloat risk (git ls-files large files, stray build artifacts tracked), referenced-but-missing assets (grep src/href vs disk), gitignored paths that should be (frames build output), accessibility quick pass (alt text, aria on icon-only buttons), console.error/dead code references.";;
*) echo "unknown domain: $DOMAIN"; exit 1;;
esac

claude --dangerously-skip-permissions -p "You are REPORTER agent for the us-photobooth swarm, domain: ${DOMAIN}. Work in the repo root ($(pwd)).

${BRIEF} Write each distinct defect as a separate issue file.

Issue file format: swarm/issues/${START}-<slug>.md (increment the number for each subsequent issue) with frontmatter:
---
status: open
domain: ${DOMAIN}
severity: critical | major | minor
---
Then body: SYMPTOM / REPRO or EVIDENCE (exact file:line, rule, or code path) / EXPECTED / ACTUAL / SUGGESTED FIX DIRECTION.

Rules: issues only, NO code changes, NO fixes. Write between 3 and 10 issues; only real defects you can evidence — no speculation, no style nits without a concrete consequence. Do NOT git commit; leave that to the orchestrator." 2>&1 | tail -5
echo "--- reporter ${DOMAIN} done ---"
