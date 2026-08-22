---
status: fixed
domain: css-ui
severity: critical
---

FIX (Lane 3, 2026-08-23): replaced `--acc-ink:#fff` with dark ink matching `--ink` on honey, strawberry, blueberry, taro. Mango + matcha + choco unchanged (already dark). Contrast recomputed — all 4 fixed themes now ≥4.5:1. See swarm/LANE3-REPORT.md.

SYMPTOM
Buttons, chips, badges and menu items rendered with `--acc` background + `--acc-ink:#fff` foreground on pastel themes (honey, strawberry, blueberry, taro, mango) do NOT meet WCAG 1.4.3 contrast minimums for normal-size text. Affected reading: `contrast ratio below 3:1`, which fails BOTH AA (≥4.5:1 for text) AND AA Large (≥3:1 for >=18px or >=14px bold).

REPRO / EVIDENCE
- `css/main.css:48-77` define 6 alternate themes. For each of `honey` / `strawberry` / `blueberry` / `taro` / `mango`, `--acc` is a pale pastel (e.g. strawberry `--acc:#F58EA8`, blueberry `--acc:#8B93C9`, taro `--acc:#B4A3CF`, honey `--acc:#F2A0B4`) and `--acc-ink:#fff`.
- Computed contrast for strawberry `#F58EA8` on `#fff` is ≈ 2.46:1 (relative luminance pink ≈ 0.422, white 1.0). That puts white-on-pink strictly below the 3:1 non-text threshold and far below the 4.5:1 AA threshold.
- These tokens are consumed on the rendered surface area by:
  - `.k.p` (`.k` rule, `css/main.css:209` and base `.k:180-202`) — uses `font-size:11px` which is small/bold; large-text threshold (>18px or >14px bold) is NOT met, so AA threshold = 4.5:1.
  - `.chip.active, .chip.on` (`css/main.css:235-239`), `font-size:10px` — small text.
  - `#theme-menu button.active` (`css/main.css:126-131`), `font-size:12px` — small text.
  - `.badge.acc-bg` (`css/main.css:256`), `font-size:9px` — very small text.
  - `.pick-cell.selected .check` (`css/main.css:971-979`), white check glyph on `--acc` disc.
  - `.mode-cta .go` on landing card (`css/main.css:438-443`) and `#drop-use-btn.k.p` (inherits `.k.p`).
- Mango is a special case: it sets `--acc-ink:#4A3B1E` (line 81), so mango passes — but every other pastel theme with white ink fails. The defect is not uniform; it is theme-conditional.

EXPECTED
Every interactive surface that uses `--acc`/`--acc-ink` for text meets WCAG 2.1 AA: ≥4.5:1 for text under 18px non-bold or 14px bold; ≥3:1 for text ≥18px (or 14px bold) and for non-text UI elements.

ACTUAL
On honey/strawberry/blueberry/taro (and any future pastel token shipped with `--acc-ink:#fff`) the white-on-pastel combination is below 3:1, failing all AA thresholds including non-text. Affected interactive elements: 4 `.k.p` instances in index.html (`Gallery` button on landing line 20, `Copy Link` on room line 111, `Join` button is `.k p` not present — actually absent, so `k.p` usages are: landing Gallery, room Copy Link, reveal Save Photo line 250, drop `drop-use-btn` line 99), `.theme-menu button.active` (7 entries), `.pick-cell.selected .check` chars, `.badge.acc-bg` `#pick-count` (line 235 in index.html), `.chip.active` for filters.

SUGGESTED FIX DIRECTION
For each pastel theme, replace `--acc-ink:#fff` with a dark ink matching the theme's `--ink` token, OR darken `--acc` until contrast against white passes AA, OR introduce a dedicated `--acc-text` token per theme that the stylesheet authors can swap based on luminance class. The footer on hive mind (`.mode-cta .go`) and `.badge.acc-bg` are the worst because they use 9-10px text — those need at least 4.5:1.
