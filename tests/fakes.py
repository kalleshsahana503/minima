"""A scripted chat model so tests run with no network and no API key."""
from __future__ import annotations

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult

_SCRIPT: list[AIMessage] = []
_SEEN: list[list] = []


def script(*msgs: AIMessage) -> None:
    _SCRIPT.clear()
    _SCRIPT.extend(msgs)
    _SEEN.clear()


def seen_prompts() -> list[list]:
    return _SEEN


def call(name: str, args: dict, cid: str, content: str = "") -> AIMessage:
    return AIMessage(content=content, tool_calls=[{"name": name, "args": args, "id": cid}])


class ScriptedChat(BaseChatModel):
    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(self, tools, **kw):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kw):
        _SEEN.append(list(messages))
        if not _SCRIPT:
            raise RuntimeError("scripted model: no more messages in the script")
        nxt = _SCRIPT.pop(0)
        if isinstance(nxt, Exception):  # lets tests simulate Groq errors such as a rate limit
            raise nxt
        return ChatResult(generations=[ChatGeneration(message=nxt)])
