---
status: open
domain: deploy
severity: minor
---

## SYMPTOM
Three oversized character PNGs are tracked in git but never referenced by any JS module, template, or HTML file. They are dead weight in the deploy bundle.

## REPRO / EVIDENCE
Files:
- `assets/characters/pooh/pooh-gang-hug.png` — 5,430 KB
- `assets/characters/kitty/kitty-plush-flower.png` — 4,429 KB
- `assets/characters/kitty/kitty-3d-overalls.png` — 3,702 KB

Cross-reference:
- `grep -R 'pooh-gang-hug\|kitty-plush-flower\|kitty-3d-overalls' js/ templates/ css/ *.html` returns **no matches**.
- `templates/templates.json` lists 93 templates; none of them reference these three filenames.
- `js/frames-next.js` only resolves paths of the form `templates/${key}.png` and `thumbs/${id}-${lk}.png`; the `assets/characters/*` tree is never read at runtime.

## EXPECTED
Either (a) the file is referenced somewhere the grep misses and should be wired up, or (b) the file is unused and should be removed. Either way, an unreferenced 3–5 MB file has no place in the deployed tree.

## ACTUAL
13.5 MB of PNG data is in the repo with no read site. They propagate into every clone and every Pages push.

## SUGGESTED FIX DIRECTION
Run `git rm assets/characters/pooh/pooh-gang-hug.png assets/characters/kitty/kitty-plush-flower.png assets/characters/kitty/kitty-3d-overalls.png` and re-emit only when the frames-next emitter actually wires them into a template. (Confirms to the convention in `swarm/report.sh` and `swarm/README.md`: "Frames/templates are EMITTED by C:/Users/legof/Desktop/us/frames-next/build_frames.py — never hand-edit us-temp/frames/* or us-temp/templates/*.")
