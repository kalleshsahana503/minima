"""End-to-end backend test: real FastAPI/WebSocket/LangGraph/Chroma, scripted model, fake browser.

Run:  python tests/test_backend.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.environ["NAVI_DATA_DIR"] = tempfile.mkdtemp(prefix="navi_test_")
os.environ["NAVI_EMBEDDINGS"] = "fake"
os.environ["NAVI_ALLOW_ANY_ORIGIN"] = "1"
os.environ["GROQ_API_KEY"] = "test"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import uvicorn  # noqa: E402
import websockets  # noqa: E402
from fakes import ScriptedChat, call, script, seen_prompts  # noqa: E402
from langchain_core.messages import AIMessage  # noqa: E402

from backend import agent as agent_mod  # noqa: E402
from backend import server, store  # noqa: E402

REAL_MAKE_LLM = agent_mod.make_llm
agent_mod.make_llm = lambda: ScriptedChat()
agent_mod._pacer = agent_mod.TokenPacer(10**9)  # the scripted model has no token limit

SNAP = {
    "url": "https://gov.example/scholarship/apply", "title": "Scholarship application", "scrollY": 0, "pageHeight": 1400,
    "text": "National Scholarship Portal. Apply before 30 November. Documents needed: income certificate, marksheet, bank passbook. " * 3,
    "elements": [
        {"id": 1, "tag": "input", "type": "text", "label": "Full name"},
        {"id": 2, "tag": "input", "type": "password", "label": "Password", "secret": True},
        {"id": 3, "tag": "button", "label": "Submit application"},
    ],
}
TABS = [{"id": 5, "title": "Inbox (3)", "url": "https://mail.example.com/inbox", "active": True},
        {"id": 7, "title": "Bank statement", "url": "https://bank.example.com/s", "active": False}]
OTHER = {"url": "https://bank.example.com/s", "title": "Bank statement", "scrollY": 0, "pageHeight": 800, "text": "Balance shown here"}

script(
    call("calculator", {"expression": "12*7"}, "c1", "Let me calculate."),
    call("remember_fact", {"fact": "User prefers answers in Hindi"}, "c2"),
    call("search_visited_pages", {"query": "scholarship documents"}, "c3"),
    call("list_tabs", {}, "c4"),
    call("read_tab", {"tab_id": 7}, "c5"),
    call("type_text", {"id": 1, "text": "Asha"}, "c6", "Typing the name."),
    call("type_text", {"id": 2, "text": "hunter2"}, "c7"),
    AIMessage(content="Submit now.", tool_calls=[
        {"name": "click", "args": {"id": 3, "reason": "submit the form"}, "id": "c8"},
        {"name": "scroll", "args": {"direction": "down"}, "id": "c9"},
    ]),
    call("ask_user", {"question": "Did the confirmation page appear?"}, "c10"),
    call("finish", {"summary": "Done: form submitted. 12*7 = 84."}, "c11"),
)

port = 8766
threading.Thread(target=lambda: uvicorn.Server(uvicorn.Config(server.app, port=port, log_level="warning")).run(), daemon=True).start()
time.sleep(1.5)


async def main():
    events, requests = [], []
    async with websockets.connect(f"ws://127.0.0.1:{port}/ws") as ws:
        await ws.send(json.dumps({"type": "goal", "text": "apply for the scholarship", "profile": "Name: Asha", "remember": True, "auto": False,
                                  "url": SNAP["url"], "title": SNAP["title"]}))
        while True:
            m = json.loads(await asyncio.wait_for(ws.recv(), 60))
            events.append(m)
            t = m["type"]
            if t == "request":
                requests.append((m["kind"], m.get("action"), m["args"]))
                if m["kind"] == "snapshot":
                    data = {"ok": True, "snapshot": SNAP}
                elif m["kind"] == "list_tabs":
                    data = {"ok": True, "tabs": TABS}
                elif m["kind"] == "read_tab":
                    data = {"ok": True, "snapshot": OTHER}
                else:
                    data = {"ok": True, "result": f"did {m.get('action') or m['kind']}"}
                await ws.send(json.dumps({"type": "result", "id": m["id"], "data": data}))
            elif t == "approval_request":
                print("approval asked:", m["text"])
                await ws.send(json.dumps({"type": "approval", "id": m["id"], "allow": True}))
            elif t == "question":
                await ws.send(json.dumps({"type": "answer", "id": m["id"], "text": "yes"}))
            elif t in ("final", "error"):
                break
    return events, requests


events, requests = asyncio.run(main())
last = events[-1]
assert last["type"] == "final" and "84" in last["text"], last

actions = [(a, args.get("id")) for k, a, args in requests if k == "action"]
print("browser actions:", actions)
assert actions == [("type", 1), ("click", 3)], "secret field must be blocked and the 2nd call in a turn skipped"
assert sum(e["type"] == "approval_request" for e in events) == 1, "only the risky click asks for approval"
assert ("list_tabs", None, {}) in requests and any(r[0] == "read_tab" for r in requests)

steps_ok = [e["label"] for e in events if e["type"] == "step" and e["phase"] == "ok"]
assert any("Calculate" in s for s in steps_ok) and any("Remember" in s for s in steps_ok)

st = store.get_store()
assert [m["text"] for m in st.all_memories()] == ["User prefers answers in Hindi"]
assert st.search_pages("documents", k=2), "the page the agent read should be indexed in Chroma"
assert st.add_memory("User prefers answers in Hindi") is False  # saving twice is a no-op

# the model saw the profile, and only ONE page view at a time (stale ones are removed)
last_prompt = seen_prompts()[-1]
assert "Name: Asha" in last_prompt[0].content
assert sum(getattr(m, "name", None) == "snapshot" for m in last_prompt) == 1
print("ok: tools, guardrails, approval, tabs, memory, page index")


# ---- origin check: a normal website must not be able to drive the agent
async def origin_check():
    server.config.ALLOW_ANY_ORIGIN = False
    try:
        async with websockets.connect(f"ws://127.0.0.1:{port}/ws", origin="https://evil.example") as ws:
            await ws.send(json.dumps({"type": "goal", "text": "hi"}))
            await asyncio.wait_for(ws.recv(), 5)
        return "accepted"
    except Exception:
        return "refused"
    finally:
        server.config.ALLOW_ANY_ORIGIN = True


assert asyncio.run(origin_check()) == "refused"
print("ok: websites cannot connect to the agent")

# ---- friendly errors
for raw, needle in [("Error code: 401 invalid_api_key", "API key"), ("429 rate_limit_exceeded", "per-minute limit"), ("tool_use_failed", "malformed")]:
    assert needle.lower() in agent_mod.friendly_error(RuntimeError(raw)).lower(), raw

# ---- Groq model choice: retired models must be skipped, the first working one is used
ALIVE = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "whisper-large-v3", "canopylabs/orpheus-v1-english", "openai/gpt-oss-safeguard-20b", "qwen/qwen3.8-27b"]
c = agent_mod.choose_candidates(ALIVE, ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"])  # the old defaults are gone
assert c[:2] == ["openai/gpt-oss-120b", "openai/gpt-oss-20b"], c
assert not any(x in " ".join(c) for x in ("whisper", "orpheus", "safeguard")), c  # speech / guard models are never chosen
assert agent_mod.choose_candidates(ALIVE, ["qwen/qwen3.8-27b"])[0] == "qwen/qwen3.8-27b"  # an explicit choice wins when it exists
offline = agent_mod.choose_candidates(None, ["openai/gpt-oss-120b"])
assert offline[0] == "openai/gpt-oss-120b" and len(offline) <= 6

calls = []


class FakeGroq:
    def __init__(self, model, **kw):
        self.model = model

    def invoke(self, _):
        calls.append(self.model)
        if self.model.startswith("llama") or self.model == "openai/gpt-oss-120b":
            raise RuntimeError("Error code: 404 - {'error': {'message': 'The model `x` does not exist or you do not have access to it.', 'code': 'model_not_found'}}")
        return "ok"


real_groq, real_list = agent_mod.ChatGroq, agent_mod.list_available_models
agent_mod.ChatGroq = FakeGroq
agent_mod.list_available_models = lambda key: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
try:
    agent_mod.reset_models()
    chosen = agent_mod.resolve_models("k")
    assert chosen[0] == "openai/gpt-oss-20b", chosen  # 120b and llama answered "not found", so 20b is the first that works
    assert calls[:3] == ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"] or "openai/gpt-oss-20b" in calls, calls
    assert agent_mod.resolve_models("k") == chosen  # cached: no second round of test calls
    n = len(calls)
    agent_mod.resolve_models("k")
    assert len(calls) == n
    assert "isn't available" in agent_mod.friendly_error(RuntimeError("Error code: 404 model_not_found")).lower()
finally:
    agent_mod.ChatGroq, agent_mod.list_available_models = real_groq, real_list
    agent_mod.reset_models()
print("ok: retired Groq models are skipped automatically")

# ---- free-tier pacing: wait instead of failing
pc = agent_mod.TokenPacer(6500)
assert pc.wait_needed(3000, 0) == 0
pc.record(3000, 0); pc.record(3000, 10)
assert pc.wait_needed(3000, 20) == 40, pc.wait_needed(3000, 20)   # the first 3000 leaves the window at t=60
assert pc.wait_needed(3000, 61) == 0 or pc.wait_needed(3000, 61) <= 9
assert agent_mod.TokenPacer(100).wait_needed(5000, 0) == 0         # nothing sent yet: never block forever
big = {"url": "u", "title": "t", "text": "x" * 9000, "elements": []}
assert len(agent_mod.fmt_snapshot(big)) < 2600                       # page text is capped
assert "daily" in agent_mod.friendly_error(RuntimeError("429 rate_limit_exceeded: tokens per day (TPD) limit")).lower()
w = agent_mod.rate_limit_wait("Error code: 429 - Rate limit reached ... tokens per minute (TPM) ... Please try again in 7.2s.")
assert w is not None and 8 <= w <= 9, w
assert agent_mod.rate_limit_wait("429 rate limit reached for tokens per day (TPD)") is None
print("ok: free-tier pacing, page-size cap, daily-limit message")

# ---- optional stronger provider (Anthropic): chosen by .env, never touches Groq
real_build, real_prov = agent_mod._build_anthropic, agent_mod.config.PROVIDER
try:
    agent_mod.config.PROVIDER = "anthropic"
    os.environ.pop("ANTHROPIC_API_KEY", None)
    try:
        REAL_MAKE_LLM(); raise SystemExit("should need the Anthropic key")
    except agent_mod.MissingKey as e:
        assert "ANTHROPIC_API_KEY" in str(e)
    os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test"
    agent_mod._build_anthropic = lambda key: ("anthropic-llm", key)
    assert REAL_MAKE_LLM() == ("anthropic-llm", "sk-ant-test")
    assert "Anthropic" in agent_mod.friendly_error(RuntimeError("Error code: 401 authentication_error invalid x-api-key"))
    assert "credit" in agent_mod.friendly_error(RuntimeError("Your credit balance is too low")).lower()
finally:
    agent_mod._build_anthropic, agent_mod.config.PROVIDER = real_build, real_prov
    os.environ.pop("ANTHROPIC_API_KEY", None)
print("ok: optional Anthropic provider")

# ---- several sites at once, narration at the START of a step, and the WhatsApp permission card
script(
    AIMessage(content="", tool_calls=[
        {"name": "go_to", "args": {"url": "https://web.whatsapp.com", "new_tab": True}, "id": "w1"},
        {"name": "go_to", "args": {"url": "https://mail.google.com", "new_tab": True}, "id": "w2"},
    ]),
    call("finish", {"summary": "Both are open. Sign in if you see a login screen."}, "w3"),
)


async def two_sites(auto=False):
    events, reqs, wa_on = [], [], {"v": False}
    async with websockets.connect(f"ws://127.0.0.1:{port}/ws") as ws:
        await ws.send(json.dumps({"type": "goal", "text": "open my whatsapp and my email", "url": SNAP["url"], "title": "x", "auto": auto}))
        while True:
            m = json.loads(await asyncio.wait_for(ws.recv(), 60))
            events.append(m)
            if m["type"] == "request":
                reqs.append(m["kind"])
                if m["kind"] == "snapshot":
                    data = {"ok": True, "snapshot": SNAP}
                elif m["kind"] == "enable_whatsapp":
                    wa_on["v"] = True
                    data = {"ok": True, "result": "on"}
                elif m["kind"] == "navigate" and "whatsapp" in m["args"]["url"] and not wa_on["v"]:
                    data = {"ok": False, "error": "Minima does not work on that site (it is on the blocked list)."}
                else:
                    data = {"ok": True, "result": "Opened " + m["args"]["url"]}
                await ws.send(json.dumps({"type": "result", "id": m["id"], "data": data}))
            elif m["type"] == "approval_request":
                events.append({"type": "_asked", "text": m["text"]})
                await ws.send(json.dumps({"type": "approval", "id": m["id"], "allow": True}))
            elif m["type"] in ("final", "error"):
                return events, reqs


ev2, reqs2 = asyncio.run(two_sites())
says = [e["text"] for e in ev2 if e["type"] == "say"]
assert any("WhatsApp and Gmail together" in t for t in says), says
assert any(e["type"] == "_asked" and "WhatsApp" in e["text"] for e in ev2), "WhatsApp must ask permission first"
assert "enable_whatsapp" in reqs2 and reqs2.count("navigate") == 3, reqs2   # blocked try, retry after yes, Gmail
assert ev2[-1]["type"] == "final", ev2[-1]
print("ok: opens several sites together, speaks first, asks before enabling WhatsApp")

# ---- "do it automatically": no cards for WhatsApp / Send / Submit; payments and deletions still ask; empty text is blocked
script(
    AIMessage(content="", tool_calls=[{"name": "go_to", "args": {"url": "https://web.whatsapp.com", "new_tab": True}, "id": "a1"}]),
    call("type_text", {"id": 1, "text": "  ", "press_enter": True}, "a2"),
    call("click", {"id": 3, "reason": "send it"}, "a3"),
    call("finish", {"summary": "done"}, "a4"),
)
SNAP_AUTO = dict(SNAP, elements=[SNAP["elements"][0], SNAP["elements"][1], {"id": 3, "tag": "button", "label": "Send"}])


async def auto_run(label):
    asked, typed = [], []
    snap = dict(SNAP, elements=[SNAP["elements"][0], SNAP["elements"][1], {"id": 3, "tag": "button", "label": label}])
    async with websockets.connect(f"ws://127.0.0.1:{port}/ws") as ws:
        await ws.send(json.dumps({"type": "goal", "text": "send it", "url": SNAP["url"], "title": "x", "auto": True}))
        while True:
            m = json.loads(await asyncio.wait_for(ws.recv(), 60))
            if m["type"] == "request":
                if m["kind"] == "action":
                    typed.append(m["action"])
                data = {"ok": True, "snapshot": snap} if m["kind"] == "snapshot" else (
                    {"ok": False, "error": "Minima does not work on that site (it is on the blocked list)."} if m["kind"] == "navigate" else {"ok": True, "result": "ok"})
                await ws.send(json.dumps({"type": "result", "id": m["id"], "data": data}))
            elif m["type"] == "approval_request":
                asked.append(m["text"])
                await ws.send(json.dumps({"type": "approval", "id": m["id"], "allow": False}))
            elif m["type"] in ("final", "error"):
                return asked, typed


asked1, acts1 = asyncio.run(auto_run("Send"))
assert asked1 == [] and "click" in acts1 and "type" not in acts1, (asked1, acts1)   # sends at once; the empty message was blocked
script(call("click", {"id": 3, "reason": "pay"}, "p1"), call("finish", {"summary": "done"}, "p2"))
asked2, acts2 = asyncio.run(auto_run("Pay now"))
assert len(asked2) == 1 and "click" not in acts2, (asked2, acts2)                      # money always asks (and we said no)
print("ok: automatic mode skips cards for sending, still asks for payments, blocks empty messages")

# ---- Groq counts limits per model: when one model's minute is full the next one answers at once
class M:
    def __init__(self, name, fail=None):
        self.name, self.fail, self.n = name, fail, 0

    async def ainvoke(self, msgs):
        self.n += 1
        if self.fail:
            raise RuntimeError(self.fail)
        return AIMessage(content=self.name)


async def pool_checks():
    a, b = M("a"), M("b")
    pool = agent_mod.ModelPool([("a", a), ("b", b)], 6500)
    pool.items[0]["pacer"].record(6400, time.monotonic())            # model a has no room left this minute
    waited = []

    async def on_wait(w):
        waited.append(w)

    r = await pool.ainvoke([agent_mod.HumanMessage(content="hi " * 800)], on_wait)
    assert r.content == "b" and not waited, (r.content, waited)      # went to b, no waiting
    gone, ok = M("gone", "Error code: 404 model_not_found"), M("ok")
    p2 = agent_mod.ModelPool([("gone", gone), ("ok", ok)], 10**9)
    assert (await p2.ainvoke([agent_mod.HumanMessage(content="x")])).content == "ok"
    await p2.ainvoke([agent_mod.HumanMessage(content="x")])
    assert gone.n == 1, "a model that does not exist is tried only once"
    full, ok2 = M("full", "Error code: 429 rate limit reached tokens per minute (TPM). Please try again in 9s"), M("ok2")
    p3 = agent_mod.ModelPool([("full", full), ("ok2", ok2)], 10**9)
    assert (await p3.ainvoke([agent_mod.HumanMessage(content="x")])).content == "ok2"


asyncio.run(pool_checks())
print("ok: model pool rotates when a model is full or missing")
print("ALL BACKEND TESTS PASSED")
