# us — Issue Swarm Protocol

Reporter files issues. Solver fixes them. Hermes verifies and closes. Commit-driven, fast.

## Layout
- `issues/` — one markdown file per issue: `NNN-slug.md`
  - frontmatter: `status: open | fixing | fixed | verified | wontfix`
  - body: symptom, repro (exact command/playwright snippet), expected, actual, severity
- Reporter = `swarm/report.sh` — headless Claude Code audit pass, WRITES issues, commits `issue: NNN ...`
- Solver = `swarm/solve.sh` — headless Claude Code, takes oldest `status: open` issue, fixes, sets `status: fixed`, commits `fix: NNN ...`
- Verifier = Hermes (me) — runs the e2e battery on each fix, flips to `verified` or reopens with notes

## Rules (both agents)
1. Frames are EMITTED by `Desktop/us/frames-next/build_frames.py` → never hand-edit
   `us-temp/frames/*` or `us-temp/templates/*`. Fix geometry in the emitter, rerun
   `build_frames.py` + `make_templates.py` (from `us/frames-next/`).
2. No hand-drawn SVG characters, no emoji glyphs in frames/UI.
3. Characters live in bands, never over photo slots.
4. Bump the cache version in `index.html` (?v=N) on any asset/JS/CSS change.
5. One issue per commit. Never mix.
6. If a fix needs >1 file family (css+js+html), still one commit, still one issue.
7. Playwright battery: `python _e2e/verify_v3.py` style probes; fake camera flags:
   `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
8. Solver may NOT close issues it can't reproduce — mark `status: open` + comment instead.

## Speed loop
```
bash swarm/report.sh        # audit -> new issues (usually 1-5)
bash swarm/solve.sh         # fix oldest open issue, commit
bash swarm/solve.sh         # again for next
# Hermes verifies in parallel between cycles
```
