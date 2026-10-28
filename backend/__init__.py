"""Minima backend."""
import os
import warnings

warnings.filterwarnings("ignore", message=".*langchain-community.*")
warnings.filterwarnings("ignore", category=DeprecationWarning)
os.environ.setdefault("USER_AGENT", "NaviEverywhere/1.0")
