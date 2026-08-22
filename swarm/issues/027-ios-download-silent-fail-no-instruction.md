---
status: fixed
domain: flows
severity: major
---

SYMPTOM
On iOS Safari the "Save Photo" button does nothing visible. The image is opened in a new tab with no UI hint to long-press / share / save, and the new tab is itself blocked by Safari's popup blocker when not triggered from a user gesture pattern the browser trusts.

REPRO / EVIDENCE
- `js/app.js:1283-1300` `downloadPhoto()`:
  ```js
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.rel = 'noopener';
  link.target = isIOS ? '_blank' : '_self';
  document.body.appendChild(link); link.click(); link.remove();
  ...
  } catch (e) {
    window.open(this.capturedImage, '_blank');
  }
  ```
  iOS Safari ignores the `download` attribute on `<a>` for cross-origin/blob URLs, so the file is just rendered in a new tab. There is no instruction overlay, toast, or status change anywhere that "the photo opened in a new tab — long-press to save".
- iOS Safari's popup blocker can also swallow the `link.click()` on synthetic anchors (especially with `target=_blank`) when the click target is created and removed synchronously the way this code does it.
- `index.html:250`: the reveal button reads `<button class="k p" onclick="app.downloadPhoto()">Save Photo</button>` — same label whether or not it's iOS. iOS users tap "Save Photo" expecting a download and get nothing.

EXPECTED
Either (a) actually download on iOS via Web Share API / `navigator.canShare({ files: [...] })` with a fallback to `<img>` fullscreen + "long-press to save" overlay, or (b) at minimum, show a visible iOS-specific instruction overlay so the user knows what happened.

ACTUAL
On iOS the tap silently does nothing useful. Many users will assume the photo was saved (it's labeled "Save Photo") and leave the app without a copy. Combined with the silent `window.open` fallback (line 1298) for any error, even when something DOES happen, they may never see it.

SUGGESTED FIX DIRECTION
For iOS, render an instruction modal: "On iPhone: tap and hold the photo, then choose 'Save to Photos'." Or attempt `navigator.share({ files: [...] })` first and fall back to the modal. Either way, surface feedback rather than relying on a background tab the user may never notice.