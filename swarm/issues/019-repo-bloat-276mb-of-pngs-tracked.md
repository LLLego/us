---
status: open
domain: deploy
severity: major
---

## SYMPTOM
The repo carries **276 MB of PNG assets** in git history. For a GitHub Pages site where `push = deploy`, this directly inflates every clone, every CI run, every `git pull`, and every Pages artifact upload. The `thumbs/` folder alone is **102 files totalling ~250 MB** (most over 3 MB each), and several character assets in `assets/characters/` push past 4 MB apiece.

## REPRO / EVIDENCE
Measured against the working tree:
```
$ git ls-files | Where-Object { $_ -match '\.png$' } | total KB
Total PNG size tracked: 276.42 MB
```
Top offenders:
| Path | Size |
|---|---|
| `assets/characters/pooh/pooh-gang-hug.png` | 5.4 MB |
| `assets/characters/kitty/kitty-plush-flower.png` | 4.4 MB |
| `thumbs/dots-grid.png` | 4.0 MB |
| `thumbs/cupid-grid.png` | 4.0 MB |
| `thumbs/poohf-single.png` | 4.0 MB |
| `thumbs/pucca-single.png` | 4.0 MB |
| `thumbs/pooh-grid.png` | 3.9 MB |
| `thumbs/gingham-grid.png` | 3.9 MB |
| `thumbs/cupid-single.png` | 3.8 MB |
| `thumbs/poohf-grid.png` | 3.8 MB |

## EXPECTED
For a Pages site: (a) thumbnails at web-display size ≤ 100–200 KB each, (b) character assets ≤ 500 KB each, (c) total PNG payload in repo < 30 MB. Pre-built templates can be regenerated locally by the emitter (the README even says so: "Fix geometry in the emitter, rerun").

## ACTUAL
96 of 102 `thumbs/*.png` files are > 500 KB; 30 are > 3 MB. Each is committed verbatim. The Pages bandwidth-cost floor is already > 250 MB and grows by the same amount every time a single frame thumb is regenerated.

## SUGGESTED FIX DIRECTION
1. Re-export `thumbs/` from the emitter at 108×135 (or 216×270) — they are rendering as 3–4 MB each but the design uses them at < 150 px on screen (see `css/main.css`/frame-sheet thumbnails).
2. Re-export `assets/characters/pooh/pooh-gang-hug.png`, `kitty-plush-flower.png`, `kitty-3d-overalls.png` at web-display resolution (≤ 800 px on the long side) — they are 4–5 MB and tracked but never referenced by any JS or template (see issue 004).
3. Move the regenerated artifacts into a deploy-time *build* step that fetches them from a release artifact, rather than committing them to git.
