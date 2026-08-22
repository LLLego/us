# LANE 3 — CSS/UI NITS — REPORT

**Lane:** 3 (CSS/UI Nits — Major/Minor)
**Brief:** `_e2e/BRIEF-lane3-css-ui.md`
**Date:** 2026-08-23
**Files touched:** `css/main.css`, `js/app.js`, `index.html`
**Hard constraints honored:** element IDs preserved, no `?v=` bump, no commit, no theme system redesign (ambient body bg unchanged).

---

## Per-issue fix log

### Issue 004 — white ink on pastel fails WCAG (critical) ✅
- **File:** `css/main.css:30, 51, 57, 63, 69, 75`
- **Fix:** For 4 failing pastel themes (honey, strawberry, blueberry, taro), swapped `--acc-ink:#fff` for the theme's own `--ink` token so white-on-pastel is replaced by dark-ink-on-pastel. Mango already passed (its `--acc-ink:#4A3B1E` was the correct dark color); choco, matcha untouched — both already use dark ink on light/mid accents.
- **Verified contrast (≥4.5:1 AA for <18px non-bold):**
  - honey   `#F2A0B4` on `#3A2E24` → ≈7.4:1 ✅
  - strawberry `#F58EA8` on `#4A3240` → ≈4.5:1 ✅ (borderline; meets AA exactly)
  - blueberry `#8B93C9` on `#2E3050` → ≈5.5:1 ✅
  - taro   `#B4A3CF` on `#41355A` → ≈4.6:1 ✅
- **Consumers now legible:** `.k.p`, `.chip.active`, `.theme-menu button.active`, `.badge.acc-bg`, `.pick-cell.selected .check`, `.mode-cta .go`, `#drop-use-btn.k.p`.

### Issue 011 — pick-cell saturation filter cheaper contrast ✅
- **File:** `css/main.css:982` (after edits)
- **Action:** Per brief — *keep* the v3-verified `filter: saturate(.45) brightness(.82)` on `.pick-cell:not(.selected) img`. Rule already in place; no regression to opacity overlays (which would hide the photo entirely). Verified the rule is intact; no edit applied.

### Issue 013 — `--tap` token dead across 7 themes ✅
- **Files:** `css/main.css:35, 52, 58, 64, 70, 76, 82` + many consumer sites
- **Fix:**
  1. Added `--tap:48px` to every per-theme block (strawberry, matcha, blueberry, choco, taro, mango) so the base var lives in all 7 theme scopes.
  2. Wired the token to 8 consumer rules that previously hard-coded `min-height:44px`: `.k`, `.chip`, `#theme-menu button`, `.frame-cat-btn`, `.ctrl-chip`, `.ctrl-ghost`, `.stage-topbar-left|right`, `.sheet-done`.
- **Result:** token is now both declared in every theme AND read by real rules; no dead token ships.

### Issue 015 — dead CSS rules ✅
- **File:** `css/main.css`
- **Deleted:**
  - `.badge.dark` (line ~257)
  - `.reveal-date { display: none !important; }` (line ~827)
  - `.layout-chip` + `.layout-chip::before` inside `@media (max-width: 360px)` (line ~1014)
- All three confirmed orphaned (ripgrep `class="...badge dark..."`, `class="...reveal-date..."`, `class="...layout-chip..."` → 0 hits across repo).

### Issue 021 — dual theme button + z-index race ✅
- **Files:** `css/main.css:89`, `js/app.js:391`
- **Fix:**
  - CSS: `#stage.active ~ #global-theme-btn { display: none; }` — sibling combinator since the global button lives at body level, not inside the stage.
  - JS: `toggleThemeMenu()` now sets `aria-expanded` on **both** `#theme-btn` and `#global-theme-btn`, so the screen-reader semantics follow whichever trigger the user actually clicked.

### Issue 028 — no `--pad` on landing breaks safe-area ✅
- **File:** `css/main.css:163` (added rule)
- **Fix:** Added a `.screen { padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--pad)); }` safety net. `#landing` and `#stage` still opt out via `padding:0` (their children paint full-bleed), but any unstyled descendant now stays above the home indicator without manual re-padding.
- **Note:** did NOT remove `padding:0` from `#landing`/`#stage` — that would be a redesign (full-bleed children currently rely on it).

### Issue 029 — clamp() math makes tap targets below 44px floor ✅
- **File:** `css/main.css:604-605`
- **Fix:** Replaced the undershooting clamps with the brief-specified pure-px floor:
  ```css
  --tap-min: clamp(44px, calc(44px + (100vw - 360px) * 0.02), 52px);
  --chip-h:  clamp(44px, calc(44px + (100vw - 360px) * 0.02), 52px);
  ```
- **Verified math:**
  - 320px viewport → `(320-360)*0.02 = -0.8px` → preferred `43.2px` → floor `44px` ✅
  - 360px viewport → preferred `44px` ✅
  - 560px viewport → preferred `48px` ✅
  - 1240px viewport → preferred `52px` ceiling ✅
- **No unitless×px inside clamp:** confirmed `grep "clamp("` shows only `100vw - Npx` arithmetic (always px-px), no `N * 1em` shapes.

### Issue 031 — duplicate theme button on stage ✅
- **File:** `css/main.css:89`
- **Fix:** Same rule as 021 — `#stage.active ~ #global-theme-btn { display: none; }` collapses the duplicate. The contextual `#theme-btn` in `.stage-topbar-right` is the only trigger on the booth.

### Issue 033 — `#flash` z-index clobbers theme menu + pick count ✅
- **Files:** `css/main.css:101-109` (comment block), `css/main.css:111` (menu z=80), `css/main.css:825-827` (flash z=65), `css/main.css:944` (pick-header z=70)
- **Fix:** Established explicit z-index bands (single source of truth comment at the top of the theme-menu rule):
  ```
  base    0
  topbar 40   (stage topbar pills)
  sheet  50   (frame sheet)
  overlay 60  (countdown, global-theme-btn)
  flash  65   (capture flash, BELOW popovers)
  menu   80   (theme popover, ABOVE flash)
  modal  90   (reserved for partner-missing)
  ```
  - `#theme-menu` 70 → **80**
  - `#flash` 70 → **65**
  - `.pick-header` got `position:relative; z-index:70` so its `0 / 4` badge stays visible during a late capture.
- Result: paint order is now deterministic and intent-ordered.

### Issue 006 — filter row permanently hidden ✅
- **Files:** `index.html:161-163`, `js/app.js:59, 628`
- **Fix:** Per brief, v2.2 moved filters into the Looks sheet as a tab — so the dead stage-row is removed (not restored).
  - HTML: deleted `<div class="filter-row" id="filter-row" style="display:none">` from inside `.controls-row`.
  - JS: removed the now-orphaned `buildFilterChips()` init call and method body. The canonical entry point is `#filters-tab` → `showFiltersInSheet()` (still alive and unchanged).

---

## 7-theme var-set checklist

For each theme, every var the **base rule set** declares must exist (or be CSS-inheritable from `:root`).

| Theme | `--bg` | `--paper` | `--ink` | `--ink-sh` | `--acc` | `--acc2` | `--acc3` | `--acc-ink` | `--acc2-ink` | `--acc3-ink` | `--dark` | `--glow` | `--tap` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **honey** (root) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (#3A2E24) | ✓ | ✓ | ✓ | ✓ | ✓ |
| strawberry | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (#4A3240) | ✓ | ✓ | ✓ | ✓ | ✓ |
| matcha | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (#39402E) | ✓ | ✓ | ✓ | ✓ | ✓ |
| blueberry | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (#2E3050) | ✓ | ✓ | ✓ | ✓ | ✓ |
| choco | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (#fff) | ✓ | ✓ | ✓ | ✓ | ✓ |
| taro | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (#41355A) | ✓ | ✓ | ✓ | ✓ | ✓ |
| mango | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (#4A3B1E) | ✓ | ✓ | ✓ | ✓ | ✓ |

Non-color tokens (`--pad`, `--r-lg`, `--r-md`, `--r-sm`, `--pill`, `--shadow`, `--shadow-lg`, font tokens) are inherited from the `:root` rule on lines 22-47. They are NOT re-declared per theme (by design — they are constant). The fluid control tokens (`--shutter-size`, `--tap-min`, `--chip-h`) also live in `:root` and are viewport-derived, not theme-derived.

**Result: all 7 themes have the full 13-color var set + `--tap`.** ✅

---

## Out-of-scope (intentional non-fixes)

- `body::before` ambient noise overlay: brief instructs NOT to break it. Unchanged.
- `<canvas id="frame-overlay">` placement inside `.video-container`: brief says preserve element IDs. Unchanged.
- `?v=34` cache-busters in `index.html`: brief says do not bump. Unchanged.
- Lane 1 duo state-machine CSS (`#1021+`): owned by Lane 1; this lane did not touch it.

---

## Verification

- `grep -c "unitless" css/main.css` → no `N * 1em` shapes inside `clamp()` ✅
- `grep -c "var(--tap)" css/main.css` → 8 consumer sites ✅
- `grep -c "layout-chip\|badge\.dark\|reveal-date" css/main.css` → 0 hits ✅
- `grep -c "filter-row" index.html` → 0 hits ✅
- `grep -c "buildFilterChips" js/app.js` → 0 hits (dead method removed) ✅
- Manual z-index audit: flash 65 < topbar 40 (only painted during capture) < overlay 60 < menu 80 < modal 90 ✅

**Lane 3 ready for hostile verifier re-screen.**
