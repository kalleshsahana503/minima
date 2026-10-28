"""Minima backend: FastAPI + WebSocket that hosts the LangGraph agent.

Run from the project's backend folder's parent:   uvicorn backend.server:app --port 8000
(START-HERE.bat does this for you on Windows.)
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from langchain_core.messages import HumanMessage

from . import agent as agent_mod
from . import config, store

log = logging.getLogger("navi.server")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Minima backend")


@app.get("/health")
async def health():
    return {"ok": True, "model": config.MODEL, "data": str(config.DATA_DIR)}


class Session:
    """One browser tab's connection. Keeps the short chat history for follow-up questions."""

    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.profile = ""
        self.remember_pages = True
        self.auto_approve = True
        self.elements: dict[int, dict] = {}
        self.tab_title = ""
        self.history: list[tuple[str, str]] = []
        self.pending: dict[str, asyncio.Future] = {}
        self.task: asyncio.Task | None = None
        self.goal_text = ""
        self.graph = None
        self._indexed: set[str] = set()

    async def emit(self, payload: dict):
        try:
            await self.ws.send_text(json.dumps(payload))
        except Exception:
            pass  # browser went away

    async def _wait(self, payload: dict):
        rid = uuid.uuid4().hex[:10]
        fut = asyncio.get_running_loop().create_future()
        self.pending[rid] = fut
        await self.emit({**payload, "id": rid})
        try:
            return await fut
        finally:
            self.pending.pop(rid, None)

    async def request(self, kind: str, action: str | None = None, args: dict | None = None) -> dict:
        data = await self._wait({"type": "request", "kind": kind, "action": action, "args": args or {}})
        return data if isinstance(data, dict) else {"ok": False, "error": "bad reply from the browser"}

    async def ask_approval(self, text: str) -> bool:
        return bool(await self._wait({"type": "approval_request", "text": text}))

    async def ask_question(self, text: str) -> str:
        return str(await self._wait({"type": "question", "text": text}))

    async def finish(self, text: str):
        self.history.append((self.goal_text, text))
        self.history = self.history[-8:]
        await self.emit({"type": "final", "text": text})

    def resolve(self, rid: str, value):
        fut = self.pending.get(rid)
        if fut and not fut.done():
            fut.set_result(value)

    def index_later(self, snap: dict):
        """Remember what Minima read so 'that page I saw earlier' works. Skipped if the user turned it off."""
        url = snap.get("url", "")
        if not self.remember_pages or not url or url in self._indexed:
            return
        self._indexed.add(url)

        async def _go():
            try:
                await asyncio.to_thread(store.get_store().index_page, url, snap.get("title", ""), snap.get("text", ""))
            except Exception as e:
                log.warning("page index skipped: %s", e)

        asyncio.create_task(_go())

    async def run_goal(self, text: str, url: str, title: str):
        self.goal_text = text
        try:
            if self.graph is None:
                # building picks and tests a Groq model (a few network calls), so keep it off the event loop
                self.graph = await asyncio.to_thread(agent_mod.build_graph, self)
            msg = HumanMessage(content=f"USER REQUEST: {text}\n(Current tab: {title!r} — {url})")
            await self.graph.ainvoke({"messages": [msg], "steps": 0, "acted": False}, config={"recursion_limit": 150})
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.exception("agent failed")
            if agent_mod._model_missing(str(e)):  # the model was retired or blocked: choose again next time
                agent_mod.reset_models()
                self.graph = None
            await self.emit({"type": "error", "text": agent_mod.friendly_error(e)})

    def stop(self):
        if self.task and not self.task.done():
            self.task.cancel()
        for fut in list(self.pending.values()):
            if not fut.done():
                fut.cancel()


def _origin_ok(ws: WebSocket) -> bool:
    if config.ALLOW_ANY_ORIGIN:
        return True
    origin = ws.headers.get("origin", "")
    if not origin.startswith(("chrome-extension://", "moz-extension://")):
        return False  # a website tried to talk to your local agent: refuse
    return not config.TOKEN or ws.query_params.get("token") == config.TOKEN


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    if not _origin_ok(ws):
        await ws.close(code=4403)
        return
    await ws.accept()
    session = Session(ws)
    try:
        while True:
            msg = json.loads(await ws.receive_text())
            t = msg.get("type")
            if t == "goal":
                session.stop()
                session.profile = str(msg.get("profile", ""))[:2000]
                session.remember_pages = bool(msg.get("remember", True))
                session.auto_approve = bool(msg.get("auto", True))
                session.task = asyncio.create_task(session.run_goal(str(msg.get("text", ""))[:2000], msg.get("url", ""), msg.get("title", "")))
            elif t == "result":
                session.resolve(msg["id"], msg.get("data"))
            elif t == "approval":
                session.resolve(msg["id"], bool(msg.get("allow")))
            elif t == "answer":
                session.resolve(msg["id"], str(msg.get("text", "")))
            elif t == "stop":
                session.stop()
            elif t == "reset":
                session.stop()
                session.history.clear()
            elif t == "ping":
                await session.emit({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        session.stop()
