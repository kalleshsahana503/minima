"""Tools the agent can call.

* SERVER tools run here: DuckDuckGo search, fetch a public page, calculator, memory, index of visited pages.
* BROWSER tools are schema-only here; the browser extension performs them on the real page.
"""
from __future__ import annotations

import ast
import operator
from typing import Literal

from langchain_core.tools import StructuredTool, tool
from pydantic import BaseModel, Field

from . import store, web

LIMIT = 6000


# ============================== server tools ==============================
@tool
def web_search(query: str, kind: Literal["text", "news"] = "text", max_results: int = 5) -> str:
    """Search the web with DuckDuckGo. Use for current facts, news and to find official pages. kind: 'text' or 'news'."""
    try:
        from ddgs import DDGS

        with DDGS() as d:
            rows = list(d.news(query, max_results=max_results)) if kind == "news" else list(d.text(query, max_results=max_results))
    except Exception as e:
        return f"Search failed: {e}. Try different words or retry in a minute."
    if not rows:
        return "No results."
    out = []
    for i, r in enumerate(rows, 1):
        date = f" ({r['date']})" if r.get("date") else ""
        out.append(f"{i}. {r.get('title', '').strip()}{date}\n   {r.get('href') or r.get('url') or ''}\n   {(r.get('body') or '').strip()[:300]}")
    return "\n".join(out)[:LIMIT]


@tool
def fetch_page(url: str) -> str:
    """Download a PUBLIC web page (no login) and return its text and main links. Use after web_search."""
    try:
        p = web.read_page(url)
    except Exception as e:
        return f"Could not fetch {url}: {e}"
    links = "\n".join(f"- {label}: {href}" for label, href in p["links"][:20])
    return f"URL: {p['url']}\nTITLE: {p['title']}\n\n{p['text']}{chr(10) + '[truncated]' if p['truncated'] else ''}\n\nLINKS:\n{links}"[:LIMIT]


@tool
def search_visited_pages(query: str) -> str:
    """Search pages Minima has already read for the user (their own browsing, stored locally). Use for 'that page I saw earlier'."""
    try:
        docs = store.get_store().search_pages(query, k=4)
    except Exception as e:
        return f"Page index unavailable: {e}"
    if not docs:
        return "Nothing indexed yet."
    return "\n\n".join(f"[{d.metadata.get('title') or d.metadata.get('host')}]({d.metadata.get('url')})\n{d.page_content[:700]}" for d in docs)[:LIMIT]


@tool
def remember_fact(fact: str) -> str:
    """Save a durable fact the USER told you about themselves (name, language, preference). Never secrets, IDs or passwords."""
    try:
        return "Saved." if store.get_store().add_memory(fact) else "Already remembered."
    except Exception as e:
        return f"Memory unavailable: {e}"


@tool
def recall_facts(query: str) -> str:
    """Look up what is remembered about the user."""
    try:
        hits = store.get_store().search_memory(query)
    except Exception as e:
        return f"Memory unavailable: {e}"
    return "\n".join(f"- {h}" for h in hits) or "Nothing remembered yet."


_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod, ast.Pow: operator.pow, ast.USub: operator.neg, ast.UAdd: operator.pos,
}


def _eval(n):
    if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
        return n.value
    if isinstance(n, ast.BinOp) and type(n.op) in _OPS:
        a, b = _eval(n.left), _eval(n.right)
        if isinstance(n.op, ast.Pow) and abs(b) > 100:
            raise ValueError("exponent too large")
        return _OPS[type(n.op)](a, b)
    if isinstance(n, ast.UnaryOp) and type(n.op) in _OPS:
        return _OPS[type(n.op)](_eval(n.operand))
    raise ValueError("only numbers and + - * / // % ** are allowed")


class _Calc(BaseModel):
    expression: str = Field(description="e.g. (1200*18)/100 + 45")


calculator = StructuredTool.from_function(
    func=lambda expression: str(_eval(ast.parse(expression, mode="eval").body)),
    name="calculator",
    description="Exact arithmetic. Use instead of mental maths.",
    args_schema=_Calc,
    handle_tool_error=True,
)

SERVER_TOOLS = [web_search, fetch_page, search_visited_pages, remember_fact, recall_facts, calculator]


# ============================== browser tools (schema only) ==============================
@tool
def click(id: int, reason: str) -> str:
    """Click the element with this id from the LATEST page view. reason = short description of what it does."""
    return ""


@tool
def type_text(id: int, text: str, press_enter: bool = False) -> str:
    """Type into the input/textarea with this id (replaces its content). press_enter=true submits a search box."""
    return ""


@tool
def select_option(id: int, option: str) -> str:
    """Choose an option (by visible text) in the dropdown with this id."""
    return ""


@tool
def scroll(direction: Literal["down", "up"] = "down") -> str:
    """Scroll the page about one screen."""
    return ""


@tool
def go_to(url: str, new_tab: bool = False) -> str:
    """Open a full http(s) URL in the current tab, or in a new tab if new_tab=true."""
    return ""


@tool
def list_tabs() -> str:
    """List the user's open tabs (id, title, url). Use to answer questions about their other apps/sites."""
    return ""


@tool
def read_tab(tab_id: int) -> str:
    """Read the text of another open tab by id (from list_tabs)."""
    return ""


@tool
def switch_tab(tab_id: int) -> str:
    """Make another open tab the one you are working on (and bring it to the front)."""
    return ""


BROWSER_TOOLS = [click, type_text, select_option, scroll, go_to, list_tabs, read_tab, switch_tab]


# ============================== control tools ==============================
@tool
def ask_user(question: str) -> str:
    """Ask the user a question and wait. Use for missing details, choices, or for secrets they must type themselves."""
    return ""


@tool
def finish(summary: str) -> str:
    """Finish and show this answer to the user. Plain language, short. Use markdown links for sources."""
    return ""


CONTROL_TOOLS = [ask_user, finish]
ALL_TOOLS = SERVER_TOOLS + BROWSER_TOOLS + CONTROL_TOOLS
SERVER_BY_NAME = {t.name: t for t in SERVER_TOOLS}
BROWSER_NAMES = {t.name for t in BROWSER_TOOLS}
