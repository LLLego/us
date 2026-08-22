"""FULL Royal Court — orchestration architecture deliberation. Adapts court_booth_full.py harness."""
import json, pathlib, time, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

P = pathlib.Path(r"D:\hermes\profiles\hermes-agent\pools")

def load(pool_name):
    d = json.load(open(P / f"{pool_name}.json"))
    if isinstance(d, list): return d
    pool = d.get("credential_pool", d)
    if isinstance(pool, dict):
        out = []
        for v in pool.values():
            if isinstance(v, list): out.extend(v)
            else: out.append(v)
        return out
    return pool

def key_of(e): return e.get("access_token") or e.get("api_key") or ""

def call_openai(url, key, model, messages, max_tokens=3000, extra=None):
    body = {"model": model, "messages": messages, "max_tokens": max_tokens}
    if extra: body.update(extra)
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=150) as r:
        d = json.loads(r.read())
        return d["choices"][0]["message"]["content"]

def call_anthropic(url, key, model, messages, max_tokens=3000):
    req = urllib.request.Request(url + "/messages", data=json.dumps(
        {"model": model, "max_tokens": max_tokens, "messages": messages}).encode(),
        headers={"Content-Type": "application/json", "x-api-key": key,
                 "anthropic-version": "2023-06-01"})
    with urllib.request.urlopen(req, timeout=150) as r:
        d = json.loads(r.read())
        return "".join(b.get("text","") for b in d.get("content", []))

PROMPT = """You are one seat of the Royal Court advising on an ENGINEERING-ORCHESTRATION decision. Speak ONLY as yourself — do not role-play other seats.

PROJECT: "us" — a personal two-person photobooth PWA (GitHub Pages, vanilla JS, no backend, PeerJS duo mode). Solo dev (a teen) + Hermes (an orchestrator agent) + Claude Code (headless coding agent, invoked via briefs). Prod is live and green on all automated flows.

SITUATION: We just ran a SWARM of 5 parallel Claude Code reviewer agents over the whole codebase. They filed ~25 issues. Headline findings:
- Duo/together mode has CONVERGING breakage: duo layout chips never built in the picker, finalStrip adoption one-sided, pair-capture finalization unreachable, pickRetake doesn't sync to partner, drop-frame flow orphans the peer. One reviewer: "the two-places-one-frame promise is not delivered by any reachable code path." (Note: duo DID pass a two-peer E2E earlier this month, so some paths work — reporters may overstate.)
- A supabase anon key committed; ~276MB of PNGs possibly tracked (bloat); missing cache-busters; iOS save-path silent failure; several memory leaks (object URLs, rAF loop); a handful of CSS tap-target/z-index nits.
- Frame/template system: clean, 0 issues.

HISTORY (track record that must inform your verdict):
- Claude Code builds FAST and structure is good, but every serious shipped bug came from ASYNC RACES and STATE-RESET bugs that PASSED Claude's own checks (double-spawned capture chains, arrays wiped in recursive steps, guests stranded). Caught only by the orchestrator tracing state mid-flow with timeline sampling.
- Solo Hermes patching is slower and the user has explicitly demanded Claude Code do the coding.
- The Royal Court (you) has a proven loop: deliberate -> battle plan -> Claude Code executes -> court reviews -> test closure. Peaked 9.25/10 on another project across 8 cycles.
- Deploy is git-push-to-Pages; a bot mishandling git history caused a 219MB repo bloat before.

THE QUESTION: What is the genuine BEST orchestration architecture for the FIX CYCLE (and going forward) — who writes code, who verifies, how much autonomy, which loop? Consider at least: (a) pure swarm loop (Claude reports, Claude fixes, Claude verifies), (b) Hermes+Claude two-tier (Claude codes, Hermes hostile-verifies the async/state class only), (c) full court loop (court strategy -> Claude Code batch-executes -> court reviews -> score), (d) hybrids. Be decisive and concrete.

YOUR VERDICT, under 400 words:
A) Pick ONE architecture (or a named hybrid). One sentence why.
B) Division of labor for THIS fix cycle: who triages the 25 issues, who fixes, who verifies, who deploys. Concrete.
C) The duo-mode cluster: fix as one root-cause battle plan or as separate issues? What's the likely root cause pattern given the evidence?
D) Autonomy boundaries: what must NEVER be fully automated here (be specific — git history, secrets, deploy, design taste...?) and what SHOULD be.
E) The one process rule that would have prevented the most past failures in this project's history."""

def try_cycle(name, pools_list, fn_factory):
    for pool_name, keys, start_idx in pools_list:
        entries = [e for e in load(pool_name) if len(key_of(e)) > 10]
        ordered = entries[start_idx:] + entries[:start_idx]
        for i, e in enumerate(ordered):
            try:
                return name, fn_factory(key_of(e))
            except Exception:
                time.sleep(2)
                continue
    return name, None

SEAT_DEFS = [
    ("Royal Sage (GLM-5.2, Zhipu)", [("glm", None, 2)],
     lambda k: call_anthropic("https://open.bigmodel.cn/api/anthropic/v1", k, "glm-5.2",
                              [{"role":"user","content":PROMPT}], 2500)),
    ("War Sage (GLM-5.2, SiliconFlow)", [("siliconflow", None, 0)],
     lambda k: call_openai("https://api.siliconflow.cn/v1/chat/completions", k, "zai-org/GLM-5.2",
                           [{"role":"user","content":PROMPT}], 2500)),
    ("Spymaster (MiniMax-M3)", [("m3", None, 1)],
     lambda k: call_anthropic("https://api.minimax.io/anthropic/v1", k, "MiniMax-M3",
                              [{"role":"user","content":PROMPT}], 2500)),
    ("Grand Vizier (Qwen3.8-Max)", [("dash", None, 1)],
     lambda k: call_openai("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", k, "qwen3.8-max",
                           [{"role":"user","content":PROMPT}], 2500, {"enable_thinking": False})),
    ("Oracle (Qwen3.7-Max)", [("dash", None, 2)],
     lambda k: call_openai("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", k, "qwen3.7-max",
                           [{"role":"user","content":PROMPT}], 2500, {"enable_thinking": False})),
    ("Court Scholar (Kimi K2.6)", [("kimi", None, 0), ("dash", None, 3)],
     lambda k: call_openai("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", k, "kimi-k2.6",
                           [{"role":"user","content":PROMPT}], 2000, {"enable_thinking": False})),
    ("Master of Engineers (Kimi K2.7-Code)", [("kimi", None, 1), ("dash", None, 4)],
     lambda k: call_openai("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", k, "kimi-k2.7-code",
                           [{"role":"user","content":PROMPT}], 2000, {"enable_thinking": False})),
    ("Lord Commander (DS V4 Flash)", [("ds", None, 1), ("dash", None, 5)],
     lambda k: call_openai("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", k, "deepseek-v4-flash",
                           [{"role":"user","content":PROMPT}], 2500)),
    ("Seer (GLM-4.5V, SiliconFlow)", [("siliconflow", None, 1)],
     lambda k: call_openai("https://api.siliconflow.cn/v1/chat/completions", k, "zai-org/GLM-4.5V",
                           [{"role":"user","content":PROMPT}], 2000)),
    ("Whispers (Qwen3-VL-32B-Thinking, SF)", [("siliconflow", None, 2), ("dash", None, 6)],
     lambda k: call_openai("https://api.siliconflow.cn/v1/chat/completions", k, "Qwen/Qwen3-VL-32B-Thinking",
                           [{"role":"user","content":PROMPT}], 2000)),
    ("Herald (DS V4 Flash, SF)", [("siliconflow", None, 3), ("ds", None, 2)],
     lambda k: call_openai("https://api.siliconflow.cn/v1/chat/completions", k, "deepseek-ai/DeepSeek-V4-Flash",
                           [{"role":"user","content":PROMPT}], 2500)),
]

def run_seat(seat):
    name, pools, fn = seat
    t0 = time.time()
    try:
        _, out = try_cycle(name, pools, fn)
        return name, out, time.time()-t0
    except Exception:
        return name, None, 0

results = {}
for wave in (SEAT_DEFS[:6], SEAT_DEFS[6:]):
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(run_seat, s): s[0] for s in wave}
        for fut in as_completed(futs):
            name, out, dt = fut.result()
            if out:
                results[name] = out
                print(f"[OK {dt:.0f}s] {name}")
            else:
                print(f"[FAIL] {name}")

for k, v in results.items():
    print(f"\n{'='*70}\n=== {k} ===\n{'='*70}\n{v[:2600]}")

out_path = pathlib.Path(r"C:\Users\legof\Desktop\us-temp\swarm\court-verdicts-orchestration.md")
out_path.write_text(
    "# FULL Royal Court (11 seats) — orchestration architecture deliberation (Aug 21)\n\n"
    + f"**{len(results)}/11 seats responded**\n\n"
    + "\n\n---\n\n".join(f"## {k}\n\n{v}" for k, v in results.items()), encoding="utf-8")
print(f"\n\nSAVED: {len(results)}/11 -> {out_path}")
