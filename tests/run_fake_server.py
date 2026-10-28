"""Starts the REAL backend with a scripted model (no API key needed) for the browser test.
Run by tests/test_extension.py; not part of normal use."""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.environ["NAVI_DATA_DIR"] = tempfile.mkdtemp(prefix="navi_e2e_")
os.environ["NAVI_EMBEDDINGS"] = "fake"
os.environ["GROQ_API_KEY"] = "test"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import uvicorn  # noqa: E402
from fakes import ScriptedChat, call, script  # noqa: E402

from backend import agent as agent_mod  # noqa: E402
from backend import server  # noqa: E402

agent_mod.make_llm = lambda: ScriptedChat()
agent_mod._pacer = agent_mod.TokenPacer(10**9)  # scripted model: no token limit
script(
    # goal 1: fill + submit the form
    call("type_text", {"id": 1, "text": "Asha Rao"}, "a1", "Typing your name."),
    call("click", {"id": 3, "reason": "submit the application"}, "a2", "Submitting the form."),
    call("finish", {"summary": "Done. I filled in **Asha Rao** and submitted the form. See [the portal](https://example.test/portal)."}, "a3"),
    # goal 2: follow a link (the page navigates; the chat must survive it)
    call("click", {"id": 4, "reason": "open the next page"}, "b1", "Opening the next page."),
    call("finish", {"summary": "I'm on the second page now. The chat stayed with me."}, "b2"),
    # goal 3: look at the user's tabs
    call("list_tabs", {}, "c1"),
    call("finish", {"summary": "You have these tabs open."}, "c2"),
    # goal 4: given by voice
    call("finish", {"summary": "Voice works. This page is the **test portal**; see [docs](https://example.test/docs)."}, "d1"),
)
uvicorn.run(server.app, host="127.0.0.1", port=8765, log_level="warning")
