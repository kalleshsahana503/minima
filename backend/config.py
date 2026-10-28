"""Settings for the Minima backend. Everything can be overridden in backend/.env."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env", override=True)  # the key in backend/.env wins over any old GROQ_API_KEY set in Windows

# Data lives in your home folder, NOT inside the project: that keeps it out of OneDrive sync,
# which locks SQLite/Chroma files and makes them fail.
DATA_DIR = Path(os.getenv("NAVI_DATA_DIR", str(Path.home() / ".navi-everywhere"))).expanduser()
CHROMA_DIR = DATA_DIR / "chroma"
EMBED_CACHE_DIR = DATA_DIR / "embed_cache"
for _p in (DATA_DIR, CHROMA_DIR, EMBED_CACHE_DIR):
    _p.mkdir(parents=True, exist_ok=True)

# Groq retires models often (the two llama defaults used here before were shut down on 2026-08-16).
# Minima also asks Groq what your key can use and switches by itself if these are unavailable.
MODEL = os.getenv("NAVI_MODEL", "openai/gpt-oss-20b")  # the fast one (about 1000 tokens/second on Groq)
FALLBACK_MODELS = [m.strip() for m in os.getenv("NAVI_FALLBACK_MODELS", "openai/gpt-oss-120b").split(",") if m.strip()]
GROQ_RPS = float(os.getenv("NAVI_GROQ_RPS", "2"))  # client-side limit, keeps the free tier happy

EMBEDDINGS_PROVIDER = os.getenv("NAVI_EMBEDDINGS", "fastembed").lower()  # fastembed | huggingface | fake
EMBEDDINGS_MODEL = os.getenv("NAVI_EMBEDDINGS_MODEL", "BAAI/bge-small-en-v1.5")

MAX_STEPS = int(os.getenv("NAVI_MAX_STEPS", "22"))      # tool rounds per request
MAX_PAGE_TEXT = int(os.getenv("NAVI_MAX_PAGE_TEXT", "2200"))

# The WebSocket only accepts the browser extension. Tests set NAVI_ALLOW_ANY_ORIGIN=1.
ALLOW_ANY_ORIGIN = os.getenv("NAVI_ALLOW_ANY_ORIGIN", "") == "1"
TOKEN = os.getenv("NAVI_TOKEN", "")  # optional shared secret (also set it in the extension settings)

# Free Groq accounts allow about 8,000 tokens per minute. Minima counts what it sends and waits when needed,
# so a task slows down instead of failing. Raise this only if you have a paid Groq plan.
PROVIDER = os.getenv("NAVI_PROVIDER", "groq").strip().lower()  # groq (free, fast) | anthropic (strongest, paid)
ANTHROPIC_MODEL = os.getenv("NAVI_ANTHROPIC_MODEL", "claude-sonnet-5-5")  # or claude-opus-5-5 (smarter, slower, dearer)
# Only the free Groq tier needs the small budget; a paid provider has no 8,000-tokens-per-minute wall.
TPM_BUDGET = int(os.getenv("NAVI_TPM_BUDGET", "7200" if PROVIDER == "groq" else "100000000"))

# Speed settings
REASONING = os.getenv("NAVI_REASONING", "low")      # low | medium | high (gpt-oss models only). "low" answers fastest.
MAX_OUTPUT = int(os.getenv("NAVI_MAX_OUTPUT", "700"))  # the model writes short answers: less waiting
