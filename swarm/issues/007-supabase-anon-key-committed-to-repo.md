---
status: wontfix
domain: deploy
severity: critical
---

## SYMPTOM
The Supabase project anon key is committed verbatim to the public repo, which is unavoidable for a client-side app — but the **project URL** (`sedgohupnmmacdfwdata.supabase.co`) tied to a real, non-test Supabase project is also checked in, and the key file ships with a `// ⚠️ NOTE:` telling future readers to "replace with your real Supabase anon key". Whoever pastes the real key in will publish it to the world as soon as they commit.

## REPRO / EVIDENCE
`js/supabase.js` lines 1–9:
```
// ⚠️ NOTE: Replace SUPABASE_ANON_KEY below with your real Supabase anon key.
// The placeholder value will cause all API calls to return 401 Unauthorized.
…
const SUPABASE_URL = 'https://sedgohupnmmacdfwdata.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlZGdvaHVwbm1tYWNkZndkYXRhIiwicm9sZSI6ImFub24i…'
```
The current value is a real, valid JWT (`exp: 2102-08-21`), not a placeholder. The "replace with your real anon key" comment is misleading — at some point someone pasted a real key into the "placeholder" slot and forgot the comment.

## EXPECTED
Either the file should hold:
- A *clearly-marked* placeholder token that can never authenticate (e.g. `'PLACEHOLDER_REPLACE_ME'`), OR
- The real key, but with the misleading ⚠️ NOTE removed and the key loaded from a separate config file (or via a build-time injection step) so a fresh checkout doesn't ship a working credential.

## ACTUAL
A live Supabase project credential is in the repo. Anyone scraping the public GitHub Pages source can upload arbitrary content to the `photos` bucket, list other devices' photos, or delete them. The bucket-name (`'photos'`) and per-device-prefix scheme (`<random_id>/<ts>.jpg`) are also in the source, making targeted abuse trivial.

## SUGGESTED FIX DIRECTION
1. Rotate the `anon` key in the Supabase dashboard immediately (limit blast radius).
2. Add Row-Level Security / row-level policies on the `photos` bucket so each `deviceId` can only list/write its own prefix (currently the API accepts any `path` under the bucket).
3. Update the comment to reflect the real situation, and consider gating uploads on a per-device signed-URL exchange instead of issuing static anon keys.

## Orchestrator note (verified)
Inspected js/supabase.js — the key is the TRUNCATED PLACEHOLDER (`eyJhbG...0-fg`) from the template comment; no real secret. Reporter false positive.
