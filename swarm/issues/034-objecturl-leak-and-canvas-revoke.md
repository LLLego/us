---
status: fixed
domain: js-engine
severity: minor
---

# `downloadPhoto` allocates object URL but only revokes it on the happy path — error path leaks URL; gallery preview creates duplicate `<img>` tags with object URLs that are never revoked

## SYMPTOM
- `downloadPhoto()` at lines 1284–1300 creates an object URL via `URL.createObjectURL(blob)` and only revokes it after 30 s on success. The error path (`window.open(this.capturedImage, '_blank')` at line 1298) leaks the blob (never revoked). Also: on a 30 s timeout, if the user initiates another download before the timeout fires, two URLs are alive concurrently.
- `loadGalleryPreview` (lines 86–118) builds `<img src=item.url>` for up to 4 cloud photos. Each `<img>` is appended to `#gallery-preview`. These are NEVER cleaned up on subsequent calls — the function overwrites `preview.innerHTML = ''` at line 109, which DOES remove the `<img>` elements and lets the browser GC them, but if any `<img>` was holding an object URL (e.g. from a future Supabase signed-URL migration), the revoke would never happen. Right now URLs come from Supabase `publicUrl` (strings), so no object URLs leak — but the function is fragile to schema changes.
- More concretely: every call to `addToGallery` (line 1304) does `this.gallery.unshift({ url: dataURL, ... })`. The dataURL is stored as-is in `localStorage` (line 1311). A 200 KB JPEG dataURL becomes a 270 KB base64 string. `localStorage` quota is 5 MB per origin; filling it triggers `try/catch(e) { /* localStorage full */ }` at line 1312 — silently dropping the save. The in-memory `this.gallery` keeps growing unbounded across the session.

## REPRO / EVIDENCE
- File: `js/app.js`, lines 1284–1300 (`downloadPhoto`):
  ```js
  async downloadPhoto() {
    if (!this.capturedImage) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `us_${this.mode}_${ts}.jpg`;
    try {
      const blob = await (await fetch(this.capturedImage)).blob();
      const url = URL.createObjectURL(blob);
      const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const link = document.createElement('a');
      link.href = url; link.download = name; link.rel = 'noopener';
      link.target = isIOS ? '_blank' : '_self';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      window.open(this.capturedImage, '_blank');
    }
  }
  ```

### Failure timeline (object URL leak on error path)
1. User on iOS taps DOWNLOAD after capturing.
2. `fetch(dataURL).blob()` succeeds; `URL.createObjectURL(blob)` returns URL_A.
3. `link.click()` opens a new tab. Tab creation succeeds on iOS Safari.
4. User backgrounds the app for 30 s. The `setTimeout(() => URL.revokeObjectURL(url_A), 30000)` fires eventually.
5. On iOS, the click handler is asynchronous due to user-gesture requirements. If the `link.click()` throws synchronously (rare but possible if `link.download` is rejected), execution jumps to `catch (e)` at line 1297. The blob URL is leaked permanently — no `URL.revokeObjectURL` is ever called.

### Failure timeline (gallery bloat)
1. User takes 30 photos in a session. Each `addToGallery` prepends a dataURL to `this.gallery`.
2. `saveGallery` (line 1308) tries to `JSON.stringify` and `localStorage.setItem`. Once total exceeds ~5 MB, `setItem` throws.
3. The `try/catch` at line 1312 swallows the error silently.
4. `this.gallery` keeps growing in memory. `loadGalleryPreview` reads `this.gallery` (line 92) and shows the first 4 — these still display fine.
5. After 100 photos, `this.gallery` holds ~20 MB of dataURL strings in RAM. Mobile Safari starts evicting background tabs.

### Failure timeline (preview img with non-data URL)
1. Cloud migration replaces `publicUrl` with a signed Supabase URL that points to an object URL via `URL.createObjectURL`. (Hypothetical.)
2. `loadGalleryPreview` builds `<img src=item.url>` at line 112. The browser fetches the object URL.
3. User taps "Take photo" → `preview.innerHTML = ''` (line 109 in next call) — the `<img>` is removed from DOM. Browser GCs the `<img>`. The object URL itself is NOT revoked.

## EXPECTED
- Revoke object URL in the catch path too.
- Use `URL.revokeObjectURL` immediately after the link click, not 30 s later (most browsers retain the blob long enough for the download to start).
- Cap `this.gallery` to a smaller number (e.g. 10) and migrate overflow to Supabase-only.

## ACTUAL
- Object URL leak on `downloadPhoto` error path.
- 30 s timeout is excessive; revocation could be immediate after click for most browsers.
- `this.gallery` grows unbounded; `saveGallery` silently fails when localStorage fills.

## SUGGESTED FIX DIRECTION
- Move `URL.revokeObjectURL(url)` to immediately after `link.remove()` for non-iOS, or use a 1-second timeout. Add `URL.revokeObjectURL(url)` in the `catch` path.
- Reduce gallery cap from 20 to 10 in `saveGallery` (line 1310) and add a metric on dropped saves.
- Document `loadGalleryPreview`'s reliance on string URLs (not object URLs) so future migrations stay safe.