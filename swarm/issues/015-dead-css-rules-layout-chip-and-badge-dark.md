---
status: open
domain: css-ui
severity: minor
---

SYMPTOM
`css/main.css` ships two CSS rules (`.reveal-date`, `.badge.dark`, and `.layout-chip` inside the narrow-viewport media query) whose selectors do not match any element in `index.html` (or any other template under `templates/`). The byte cost is small, but the rules confuse maintainers and inflate the cascade: a `.badge.dark { background: var(--dark); color: var(--paper); }` declaration silently takes effect if anyone adds a `class="badge dark"` later, with no design review.

REPRO / EVIDENCE
- `.reveal-date { display: none !important; }` — `css/main.css:827`. Ripgrep across the repo `class="[^"]*\breveal-date\b"` → 0 hits. The element this was meant to hide appears to have been renamed or removed.
- `.badge.dark { background: var(--dark); color: var(--paper); }` — `css/main.css:257`. Ripgrep `class="[^"]*\bbadge dark\b"` across `*.html` → 0 hits. Nothing in `index.html` uses `class="badge dark"` (the only `class="badge"` elements are `id="shot-badge"`, `id="drop-badge-floating"`, and `id="pick-count" class="badge acc-bg"`).
- `.layout-chip` and `.layout-chip::before` — `css/main.css:1014-1015` inside `@media (max-width: 360px)`. Ripgrep `class="[^"]*\blayout-chip\b"` → 0 hits anywhere in the repo. The `#layout-row` markup on `index.html:163` is a `.frame-row`; the chip class used inside it is `.frame-chip` (declared at `css/main.css:793`).
- None of these dead rules are referenced by JS — searched `app.js` for `classList.add('reveal-date'`, `badge dark`, `layout-chip` → 0 hits.

EXPECTED
All rules in `css/main.css` match at least one element in the DOM, OR are clearly commented as "deprecated / reserved for X". A strict cascade reduces both runtime cost and audit surface.

ACTUAL
Three dead rules shipped. They will never paint; they may steer future edits in wrong directions; they bloat the small-screen media query.

SUGGESTED FIX DIRECTION
Delete `.reveal-date` (line 827), `.badge.dark` (line 257), and the `.layout-chip` + `.layout-chip::before` block (lines 1014-1015). If `.badge.dark` is intentionally reserved (e.g., dark-on-dark badge for contrast-paired theme), reintroduce it inside one actual usage in `index.html` (currently absent) and link it from the design comment block.
