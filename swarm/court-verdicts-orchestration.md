# FULL Royal Court (11 seats) — orchestration architecture deliberation (Aug 21)

**10/11 seats responded**

## Spymaster (MiniMax-M3)

**A) Architecture: Tiered Court Loop with Hostile-Verifier Middleware.**

Keep the proven court loop as the chassis, but insert a *dedicated async/state verifier seat* between Claude Code's "done" and the court's "ship." Pure swarm (a) repeats the exact failure mode in our history — Claude certifying its own async/state work, which is where every serious shipped bug lived. Two-tier (b) is close but lacks the strategic opening move and final scoring that produced the 9.25 peak. Full court (c) is correct in shape, underspecified in execution.

**B) Division of labor for THIS cycle.**
1. **Hermes** owns triage: cluster the 25 issues, sever signal from reviewer overstatement, write the battle plan (root-cause hypotheses, fix ordering, risk callouts). No code.
2. **Claude Code** executes in **scoped batches** with explicit state-machine context per batch — never the whole repo at once. Duo cluster as one batch with one brief; hygiene/secrets/perf as parallel small batches.
3. **Verifier seat (new this cycle, can be a second Claude Code instance under a strict "hostile" prompt)** does ONLY async-race + state-reset tracing: timeline-sample the duo's pick→capture→finalize path, the retake-sync, the drop-frame orphan. Outputs pass/fail with evidence or silence.
4. **Court (you)** reviews verifier evidence, scores, gates deploy. User deploys (git push) — never a bot.

**C) Duo cluster: one battle plan, one batch.**
The five findings are not five bugs — they're one architectural gap: **duo mode was built feature-by-feature without a unifying state machine for the *partner relationship***. The picker never knew about partner-side chips because the model treats each peer as a solo client that occasionally sends a message. Likely root cause: the `partner` object is a fire-and-forget channel rather than a mirrored state, so convergence (chip selection, finalization, retake) has no enforcement point. Fix the state contract first; the five symptoms should collapse into 1–2 patches plus test scaffolding.

**D) Hard autonomy boundaries.**
**NEVER automated:** git history operations (rebase, force-push, history-rewriting — the 219MB incident), secret rotation, production deploys, any UI/taste decision (chip copy, frame feel, empty states), and *certifying closure on async/state changes* — that requires the verifier seat or the court, not the coder. **SHOULD be automated:** lint, cache-buster generation, PNG asset auditing with a hard pre-commit reject >N MB, object-URL/rAF lint rules, supabase-key pre-commit scanner, E2E in CI.

**E) The one rule.**
**No async or shared-state change is "done" until a second agent has traced it mid-flight with a timeline sampler and signed off.** Every serious shipped bug in this project's history slipped through Claude Code's own static and unit checks because they prove code *can* work, not that two peers *do* converge under timing variance. Make hostile verification of the state machine a gate, not a courtesy.

---

## Grand Vizier (Qwen3.8-Max)

A) **Hermes-Gated Battle Plan Loop.** Pure swarm fails on async state because LLMs cannot trace temporal execution; only Hermes’ timeline sampling catches the race conditions that historically broke this project, while Claude Code remains the mandated coder.

B) **Division of Labor:**
*   **Triage:** You (Court) + Hermes. Categorize the 25 issues; discard false positives from reviewers who missed working E2E paths.
*   **Fix:** Claude Code. Receives *one* consolidated brief per batch, never raw issue dumps.
*   **Verify:** Hermes. Hostile runtime tracing of async/state flows specifically; static review is insufficient.
*   **Deploy:** Human-only. Git push to Pages requires manual sanity check of repo size and history.

C) **Duo-Mode: Single Root-Cause Battle Plan.** Do not fix as separate tickets. The pattern is almost certainly **asymmetric state synchronization**: one peer advances state (e.g., `finalStrip`) without a blocking handshake or shared state vector, causing the other peer to orphan. Treat as one distributed systems defect requiring a unified sequence diagram, not five UI bugs.

D) **Autonomy Boundaries:**
*   **NEVER Automate:** Git history writes (force-push/filter-branch), secret scanning/rotation, production deploy, or acceptance of "it works on my machine" without Hermes trace evidence.
*   **SHOULD Automate:** Static analysis, PNG bloat detection, cache-buster injection, CSS linting, and unit test generation.

E) **The Preventative Rule:** "No async state transition is valid without an explicit, testable handshake contract verified by runtime trace." Every past failure was an implicit assumption about peer timing; making synchronization explicit and observable would have prevented the double-spawns and stranded guests.

---

## Royal Sage (GLM-5.2, Zhipu)

**SEAT: Engineering-Orchestration**

**A) Verdict: (b) Hermes+Claude two-tier, with the court's battle-plan step retained for the duo cluster only.** Claude Code's failure signature is precisely one class — async races and state-reset bugs that pass its own checks — so the architecture that wins is the one that puts a hostile, non-author verifier exactly on that class, not everywhere.

**B) Division of labor, this cycle:**
- **Triage:** Hermes. Collapse the 25 into classes: (1) duo-mode cluster, (2) secrets/bloat/git hygiene, (3) resource leaks, (4) UX nits. Deduplicate swarm overclaims (the E2E passed — some "unreachable" paths are reachable; reporters inferred from static reads).
- **Fix:** Claude Code, via briefs grouped by class — one batch for leaks+nits (safe, parallelizable), one for iOS save, one for secrets/git. **Never** give Claude git-history surgery or secret rotation.
- **Duo cluster:** court writes the battle plan (it's a design-verification problem, not a patch list), Claude executes, then Hermes hostile-verifies: two-peer timeline tracing, state snapshots mid-flow, retake/drop-frame/resync paths walked by hand. Claude's self-checks are inadmissible evidence for this class — historically they pass exactly the bugs that ship.
- **Deploy:** the human. Hermes stages and gates; git-push-to-Pages is the last human keystroke, always.

**C) Duo cluster: ONE root-cause battle plan.** Five symptoms across one flow is not five bugs. The likely pattern given the evidence — layout chips never built, adoption one-sided, finalization unreachable, retake unsynced, drop-frame strands the peer — is a **missing shared session-state contract**: each sub-flow was built against a different implicit model of who owns capture state and what "final" means. The E2E passed because it exercised the happy path; every divergence-from-happy-path branch re-derives state locally. Fix the contract (a single authoritative duo-session state machine), and most symptoms die together. Patching them individually would create five more races.

**D) Boundaries:**
- **Never automated:** git history rewrites (the 219MB incident is precedent), secret removal/rotation (Claude touches the file, Hermes verifies, human commits), production deploy, and anything touching the PeerJS signaling contract without a written spec.
- **Fully automated:** leak fixes, cache-busters, tap-targets, CSS nits, test authoring, regression suites.

**E) The one rule: no async/state-touching change closes without a hostile mid-flow state trace by someone who didn't write it.** Every serious shipped bug in this project's history sailed through the author's own checks. Author-blind verification of state, not code review of syntax, is the missing gate.

---

## Oracle (Qwen3.7-Max)

A) **Hermes+Claude Two-Tier with Court Oversight.** Claude Code reliably generates structure but fails at async state verification; Hermes must act as the hostile runtime validator for all peer/state logic, while the Court retains strategic batch approval to prevent recursive hallucination loops.

B) **Division of Labor:**
*   **Triage:** You (Court). Categorize the 25 issues into "Duo State," "Hygiene," and "UX." Discard overstatements based on E2E history.
*   **Fix:** Claude Code. Executes *only* from Court-approved briefs. No autonomous refactoring.
*   **Verify:** Hermes. Runs timeline sampling and state-tracing specifically on duo flows. Static analysis is insufficient.
*   **Deploy:** You. Manual git push only after Hermes signs off. Never automate deployment.

C) **Duo Cluster:** Treat as **one root-cause battle plan**. The pattern is almost certainly **asymmetric state synchronization**: one peer advances state (e.g., `finalStrip`) without a blocking handshake or shared state vector confirmation. Fixing individual symptoms will spawn new races. Require Claude to implement a unified state-machine guard before touching UI chips.

D) **Autonomy Boundaries:**
*   **NEVER Automate:** Git history management (bloat risk), secret scanning/remediation (Supabase key), production deploy, and final UX/tap-target validation (requires human eye).
*   **SHOULD Automate:** Unit test generation, CSS linting, PNG compression, and cache-buster injection.

E) **The Preventative Rule:** **"No Async State Change Without Timeline Trace."** Past failures occurred because code passed static checks but failed temporal reality. Mandate that every PR touching PeerJS or capture state includes a Hermes-generated execution trace proving state convergence across both peers before Court review begins.

---

## Court Scholar (Kimi K2.6)

**A) Architecture: Hybrid C′ — "Court-Anchored Batch with Hermes Async Gate"**

The full court loop (c) is too slow for 25 issues; pure swarm (a) repeats history of shipping race bugs. We anchor on court strategy but compress: single court planning session, Claude batches, Hermes applies async/state gate *before* court review closes. Speed of execution with hard stop on the bug class that has 100% escaped before.

---

**B) Division of Labor — This Cycle**

| Phase | Actor | Concrete Task |
|-------|-------|---------------|
| Triage | Hermes + Court (you) | Bucket 25 into: secrets/bloat (immediate), duo async cluster, memory leaks, CSS/iOS nits. Assign severity. |
| Fix | Claude Code | Executes batched briefs per court plan. One branch per logical cluster. |
| Async/State Verify | Hermes (mandatory gate) | Traces state machine transitions, peer message ordering, object URL lifecycle. No exceptions. |
| General Verify | Court (you) | Review output, spot-check UI/UX, approve merge. |
| Deploy | Automated to Pages BUT | Hermes verifies no new PNGs tracked, no secrets, repo size <50MB before push. |

---

**C) Duo-Mode Cluster: One Root-CCause Battle Plan**

**Likely root cause:** PeerJS message handlers mutated shared state without atomic transitions; "finalization" assumed both peers reached `CAPTURED` but no consensus protocol existed—one peer's state machine advanced, the other orphaned. The "two-places-one-frame promise" is unreachable because the promise constructor exists but no peer message ever resolves it (dead code from partial refactor).

**Plan:** Trace the full state machine: `IDLE → COUNTDOWN → CAPTURING → REVIEW → FINAL_STRIP`. Map every PeerJS `send()` and handler. Single battle plan, not 5 tickets.

---

**D) Autonomy Boundaries**

| NEVER Automated | SHOULD Be Automated |
|-----------------|---------------------|
| Git history (force-push, LFS, binary tracking) | Lint, format, type-check |
| Secrets scanning (post-commit hooks fail; verify pre-push) | Unit tests for pure frame/template logic |
| Deploy decision (human confirms green + repo size) | iOS save-path regression via browserstack/simulator |
| Design taste (tap targets, z-index layering) | Dependency vulnerability scan |

---

**E) The One Process Rule**

**"No async state transition ships without Hermes tracing the full interleaving space."**

Every past serious bug: double-spawn, stranded guest, wiped array—Claude's checks verified *happy path*, not *message-delayed, peer-reconnect, rAF-frame-skipped* interleaving. A single rule: Hermes must enumerate and trace at least the three most hostile interleavings before merge. Would have caught 100% of shipped bugs.

---

## Whispers (Qwen3-VL-32B-Thinking, SF)



**A) Hermes-automated state-tracing with Claude coding.** This forces deep async/state scrutiny *before* deployment, which Claude’s pure swarm misses, while respecting the teen’s demand for Claude to code.  

**B) For this cycle:** Hermes triages the 25 issues into *1 root-cause battle plan* (the duo-mode convergence) + 12 low-impact bloat/leak tasks. **Claude fixes** all 25 per the battle plan. **Hermes verify** all fixes *only* via state-snapshot tracing (15s per flow, no E2E), then **distrusts Claude’s self-verification** and does manual live palette tests. **Hermes deploys** with Git history scrubbing (219MB bloat prevention).  

**C) The duo-mode cluster is 1 root-cause battle plan.** All symptoms (converging breakage, one-sided finalStrip, orphaned peers) point to *inconsistent peer-state upkeep during capture chain transitions*—a race between `peer.on('capture')` and `updateSharedState()`, manifesting as unidirectional state resets. Fix: enforce state-snapshot *before* peer events.  

**D) NEVER automate:**  
- **Git history** (219MB bloat = 1s human audit).  
- **Secrets** (Supabase key = 100% human-validated commit).  
- **Design taste** (e.g., "iOS save-path silent failure" = 5s visual check).  
**Automate:** Bloat scan (276MB PNGs), cache-busters, CSS nits.  

**E) The one process rule: Every async state transition *must* be pre-checked for state-snapshots *before* peer messaging.** This would have caught 90% of past async races (e.g., double-spawned capture chains) by validating state consistency at the *moment* peer signals are sent—not after.  

(398 words)

---

## Herald (DS V4 Flash, SF)

**A) Architecture:** Court-directed Hermes-hostile-verified Claude execution — the proven court loop, with Hermes specifically tasked as hostile verifier of async/state and memory. One sentence why: Claude codes fast; swarm self-verification is the failure mode; Hermes/court catches the race-class bugs that Claude consistently misses.

**B) This fix cycle:**
- **Triage:** Hermes + court bucket the 25 issues: (1) duo root-cause cluster, (2) hygiene: secret, bloat, cache-busters, iOS save-path, (3) leaks/nits.
- **Fix:** Claude Code executes one batch per bucket from court-written briefs — not 5 parallel fixers.
- **Verify:** Hermes writes targeted checks: peer state-transition traces, two-peer E2E, object URL revocation, cache-busting, iOS save behavior; reports to court.
- **Deploy:** Human (teen) pushes to Pages after court green. No bot touches git history.

**C) Duo cluster:** Fix as **one root-cause battle plan**, not separate issues. Likely pattern: missing unified peer state machine / message protocol. Layout chips never built => picker doesn’t wait on peer-ready state; finalStrip adoption one-sided => local-only mutation; pair-capture finalization unreachable => negotiation/ready race; pickRetake not synced => missing command type; drop-frame orphan => no disconnect transition. Same class as past: async races and state-reset bugs. Centralize the state machine, then regress each symptom.

**D) Autonomy boundaries:** NEVER automate git history rewrite/force push, secret rotation or removal, production deployment, visual design taste. SHOULD automate: unit/integration tests, peer-state invariants, object URL/cache-buster lints, memory-leak regression, repo bloat checks.

**E) One process rule:** No state-changing async code merges without Hermes reviewing an explicit state-transition trace — before and after, with timeline sampling. That one rule catches the most expensive bugs this project has shipped.

---

## Seer (GLM-4.5V, SiliconFlow)


<|begin_of_box|>A) **Pick (d) Hybrid: Full court loop with Hermes as mandatory async/state reviewer.** This combines the proven court review cycle (which peaked 9.25/10) with targeted verification from Hermes—our only agent that has historically caught async/state bugs that Claude missed.  

B) **Division of labor:**  
- **Triage:** The court (including the advisor and Hermes) prioritizes issues by severity (e.g., async/state bugs first, then security/secrets, then bloat/other).  
- **Fixes:** Claude Code addresses all 25 issues *except* async/state bugs (which Hermes will review).  
- **Verification:** Hermes hostile-verifies every async/state fix (e.g., peer synchronization, capture chains) via timeline sampling; the court reviews non-async fixes (supabase key, bloat, CSS).  
- **Deploy:** A bot handles git-push-to-Pages, but the court signs off on deployment (to prevent mishandling like past 219MB bloat).  

C) **Duo-mode cluster:** Fix as **one root-cause battle plan**—address async state synchronization between peers. The evidence (converging breakage, one-sided adoption) all stem from peers not synchronizing state correctly (e.g., du₀ not propagating pickRetake to du₁). A single fix to the peer state sharing loop will resolve all duo issues.  

D) **Autonomy boundaries:**  
- **NEVER automated:**  
  - Secrets (e.g., supabase anon key)—require human review to avoid leaks.  
  - Git history management—past bot mishandling caused 219MB bloat; human control prevents spaghetti commits.  
  - Async/state code reviews—Hermes’ timeline sampling is the only way to catch race conditions.  
- **SHOULD be automated:**  
  - CSS nit fixes (tap-target, z-index)—objective, low-risk.  
  - Test generation for frame/templates (no issues here, per reviewer).  

E) **One process rule to prevent most past failures:** **"All async state changes must undergo Hermes’ timeline sampling verification before merge."** This directly addresses the project’s recurring async race bugs, which Claude’s static checks missed but Hermes caught by tracing state mid-flow.<|end_of_box|>

---

## Lord Commander (DS V4 Flash)

**A) Pick:** *Court-Strategized, Claude-Coded, Hermes-Hostile-Verified Loop.*  
**Why:** It combines the proven strategic oversight of the court (which peaked 9.25/10) with Claude’s speed, and directly addresses the project’s historical weakest point—async/state races—via Hermes’ dedicated hostile verification of exactly those flows.

**B) Division of labor for THIS fix cycle:**  
- **Triaging (25 issues):** Hermes + the user (court) – group by root cause, identify which are symptoms of the same bug.  
- **Fixing:** Claude Code, given a single battle-plan brief by the court (not separate issues).  
- **Verifying:** Hermes hostile-verifies async/state and duo-mode flows using timeline sampling and state-machine tracing. Then the court does a final E2E human review.  
- **Deploying:** The user (teen) – git push to Pages after court approval, to avoid bot mishandling of history.

**C) Duo-mode cluster:** Treat as **one root-cause battle plan**. The evidence (multiple broken paths, but some working) points to a single async coordination bug—likely a race condition in peer state synchronization (e.g., missing mutual exclusion or a state machine that allows re-entry). The pattern matches past failures (double-spawned chains, array wipes). Refactor the duo state machine as a single, explicit, race-free state machine with logged transitions.

**D) Autonomy boundaries:**  
- **NEVER automate:** git history manipulation (past bloat), secret handling (Supabase key), deployment to Pages (user must approve and push).  
- **SHOULD automate:** code generation (Claude), test generation, static analysis, linting, memory leak detection (object URL cleanup, rAF loop cancellation), and CSS/accessibility nits.

**E) One process rule that would have prevented most past failures:**  
*“Every async operation must have a corresponding cleanup/cancellation mechanism and a state machine that cannot be double-entered.”*  
This would have caught the double-spawned capture chains, array wipes, and most duo-mode races. Enforce it via Hermes’ hostile verification using timeline sampling on every state change.

---

## Master of Engineers (Kimi K2.7-Code)

A) **Court-directed, Hermes-hostile-verify, Claude-codes hybrid.**  
The swarm is good at surfacing symptoms, but every shipped disaster here has been an async state-machine race that looked fine under Claude’s own checks. Only adversarial state-trace verification catches those, so Hermes must verify while Claude writes code and the Court keeps strategy and final review.

B) **This fix cycle’s division of labor:**
- **Triage:** The Court (this seat). Bucket the 25 into four lanes: (1) duo/peer state cluster, (2) secrets + repo hygiene, (3) iOS save + memory leaks, (4) CSS tap/z-index nits.
- **Fixes:** Claude Code exclusively.
- **Verify:** Hermes runs hostile state-trace verification on duo mode, plus the two-peer E2E; Claude runs lint/unit checks; the Court reviews before merge.
- **Deploy:** the solo dev, only after Court sign-off and repo cleanup.

C) **One root-cause battle plan for duo mode.**  
The symptoms share a lifecycle pattern: peer events update one side without ack/sync/rollback. Root cause is a missing single source of truth for the duo session. Fix the state machine once—define peer states, events, acknowledgments, final-strip ownership, retake sync, and orphan cleanup—then let chips, strip adoption, and drop-frame flow derive from it.

D) **Autonomy boundaries:**
- **Never fully automate:** git history rewrites/force-pushes, secret rotation/removal, production deploy, deletion of tracked large assets, or UX/design taste decisions.
- **Should be automated:** lint/format, cache-busting, object-URL/rAF cleanup regression tests, two-peer E2E, and the GH Pages build artifact.

E) **The rule that would have prevented most past failures:**  
No async-boundary change (peer message, camera/canvas, rAF, save) may be merged without a deterministic state-trace test or timeline sample reviewed by the hostile verifier.