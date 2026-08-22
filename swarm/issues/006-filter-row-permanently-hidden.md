---
status: fixed
domain: flows
severity: major
---

FIX (Lane 3, 2026-08-23): per brief v2.2 ships filters as a Looks-sheet tab — deleted the dead `#filter-row` from index.html and removed the orphan `buildFilterChips()` method/call from app.js. Canonical path remains #filters-tab → showFiltersInSheet().

SYMPTOM
On the stage screen there is no visible filter affordance. The chip row that is supposed to host filters is hidden in the HTML and `buildFilterChips()` never un-hides it.

REPRO / EVIDENCE
- `index.html:162`: `<div class="filter-row" id="filter-row" style="display:none"></div>` — hard-coded `display:none`.
- `js/app.js:524-536` `buildFilterChips()` populates the row but never sets `display`:
  ```js
  const row = document.getElementById('filter-row');
  if (!row) return;
  row.innerHTML = '';
  for (const [key, f] of Object.entries(FILTERS)) {
    const chip = document.createElement('button');
    ...
    row.appendChild(chip);
  }
  ```
  No `row.style.display = 'flex'` (or similar). The element exists in DOM with chips appended but remains `display:none` from the inline style.
- The only alternate path to filters is the "Looks" bottom sheet → "Filters" tab (`showFiltersInSheet`, line 572-591), which builds a SECOND set of chips inside `#filter-thumbnails`. So filters are reachable — but only if the user first opens the Looks sheet, finds the "Filters" tab (the sheet defaults to the Characters category, line 723 `setFrameCategory('casts')`), and clicks it. This is three taps and a tab the user has no reason to expect.

EXPECTED
On entering the stage, the user sees a filter chip row (the `#filter-row` originally wired into the design).

ACTUAL
The row is permanently invisible regardless of mode, frame, or sheet state. Filters are silently discoverable only through the Looks sheet → Filters tab, which most users will miss entirely.

SUGGESTED FIX DIRECTION
Either (a) delete `#filter-row` from the stage UI and rely solely on the Looks sheet filter tab, removing the misleading dead code, or (b) at the end of `buildFilterChips()` set `row.style.display = ''` (or `'flex'`) so the chip row actually appears next to the layout row as the markup implies.