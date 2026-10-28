"""Checks that backend/.env holds a plausible Groq key. Exit code 0 = fine, 1 = problem (a hint is printed).
Never prints the key itself. Used by START-HERE.bat."""
import re
import sys
from pathlib import Path

env = Path(__file__).with_name(".env")
if not env.exists():
    print("  The file backend\\.env does not exist yet.")
    sys.exit(1)

text = env.read_text(encoding="utf-8-sig", errors="replace")  # also copes with a BOM and any line endings
def _val(name):
    l = next((x.strip() for x in text.splitlines() if x.strip().startswith(name + "=")), "")
    return l.partition("=")[2].strip().strip("\"'").strip()


if _val("NAVI_PROVIDER").lower() == "anthropic":
    v = _val("ANTHROPIC_API_KEY")
    if not v or v.startswith("paste-your"):
        print("  NAVI_PROVIDER=anthropic is set, but the ANTHROPIC_API_KEY= line is empty. Paste your key after the = sign.")
        sys.exit(1)
    if not v.startswith("sk-ant-") or len(v) < 30:
        print("  The Anthropic key should start with sk-ant- (copy it again from console.anthropic.com/settings/keys).")
        sys.exit(1)
    print("  Anthropic key found.")
    sys.exit(0)

line = next((l.strip() for l in text.splitlines() if l.strip().startswith("GROQ_API_KEY")), None)
if line is None:
    print("  No line starting with GROQ_API_KEY= was found in backend\\.env.")
    sys.exit(1)

name, eq, value = line.partition("=")
value = value.strip().strip("\"'").strip()
if name.strip() != "GROQ_API_KEY" or not eq:
    print("  The key line must look like GROQ_API_KEY=gsk_...")
    sys.exit(1)
if not value or value.startswith("paste-your"):
    print("  The key line still has the placeholder text. Paste your real key after the = sign.")
    sys.exit(1)
if not value.startswith("gsk_"):
    print("  The key should start with gsk_ (copy it again from console.groq.com/keys).")
    sys.exit(1)
if not re.fullmatch(r"gsk_[A-Za-z0-9]{20,}", value):
    print("  The key has spaces or odd characters in it, or it is cut short. Copy it again.")
    sys.exit(1)
print("  Groq key found.")
sys.exit(0)
