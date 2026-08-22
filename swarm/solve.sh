#!/usr/bin/env bash
# Solver: takes oldest status:open issue, fixes it, sets status: fixed. One issue per commit.
set -euo pipefail
cd "$(dirname "$0")/.."
ISSUE=$(grep -rl '^status: open' swarm/issues/ 2>/dev/null | sort | head -1 || true)
if [ -z "$ISSUE" ]; then echo "no open issues"; exit 0; fi
echo "solving: $ISSUE"
claude --dangerously-skip-permissions -p "You are SOLVER agent for the us-photobooth swarm, working in $(pwd). Read and fix this issue completely: ${ISSUE}.

HARD RULES (from swarm/README.md):
1. Frames/templates are EMITTED by C:/Users/legof/Desktop/us/frames-next/build_frames.py — never hand-edit us-temp/frames/* or us-temp/templates/*. If the fix is frame geometry, fix the emitter and say so in the issue (leave actual re-emission to the orchestrator).
2. No hand-drawn SVG characters, no emoji glyphs.
3. Characters live in bands, never over photo slots.
4. Bump the cache version (?v=N) in index.html on any asset/JS/CSS change.
5. One issue, one commit. After fixing: set status: fixed in the issue frontmatter, append a '## Fix notes' section (what changed, files touched), then git add the changed files + the issue file and commit with message 'fix: <issue-slug>'.

If you cannot reproduce or the issue is wrong, set status: open, add a comment explaining why, commit nothing, and stop." 2>&1 | tail -5
echo "--- solver done (${ISSUE}) ---"
