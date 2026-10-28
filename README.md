# Minima Everywhere

A floating Minima logo on every website you open (Chrome or Edge). Click it and Minima reads the page you are on,
answers questions about it and about your other open tabs, finds things, fills forms with your details, and asks
before anything important. Facebook is excluded, and WhatsApp stays off until you switch it on in Settings.

```
Your browser (Chrome / Edge)                        Your computer
  floating logo + chat panel on every site  <--->   Minima agent server (Python, LangGraph, Groq)
  reads the page, clicks, types, lists tabs         DuckDuckGo search, memory (Chroma), safety checks
```

## Set up (about 10 minutes, once)

**1. Unzip.** Right-click `navi-everywhere.zip` and choose *Extract All*. Open the extracted folder until you see
`START-HERE.bat`, `README.md`, `backend` and `extension` side by side. (If you see only one more folder inside, open it.)
Keep this folder somewhere simple like `C:\navi-everywhere`, not inside OneDrive.

**2. Start the agent.** Double-click **START-HERE.bat**.
- The first time it installs everything (a few minutes) and opens Notepad so you can paste your Groq key
  after `GROQ_API_KEY=`. Get one at https://console.groq.com/keys. Save the file and close Notepad.
- When you see `Minima is running at http://127.0.0.1:8000`, leave that window open.

**3. Add the browser part.**
1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the **`extension`** folder inside navi-everywhere.
4. Click the puzzle-piece icon in the toolbar and pin Minima.

**4. Use it.** Open any website. The Minima logo appears at the bottom right.
- Click it to open the assistant. Drag it anywhere; it snaps to the nearest side.
- Keyboard shortcut: **Alt+N** opens or closes it. The toolbar button does the same.
- The first time on each site Minima asks: *Just this time*, *Always on this site*, or *Not now*.

## Talk to Minima (voice, like Siri)

- **Hands-free is on by default and has no window or tab.** Minima listens quietly inside Chrome. Just say
  **"Hey Minima, find black jeans under 500"** on any website, and she answers by herself. Say "stop" to cancel a task.
- **One-time setup:** the first time, a small page asks you to click **Allow the microphone**. Click it once. It closes by
  itself and never appears again. (Chrome does not let any extension use the microphone without that one click.)
- **If the panel says "Chrome's speech service isn't reachable":** open Settings > Microphone check, press **Test speech** and
  say something. It shows what Chrome heard, or an error code. Send me that code.
- **Check that she hears you:** Settings (sliders icon) > **Microphone check**. A green bar moves when you speak. If it stays
  flat, Windows is using another microphone: Windows Settings > System > Sound > Input.
- **Mic button** in the panel: the same ears, for one sentence. Click it, speak, and the task starts when you stop.
- **She talks back** when the job is done. Change the language under *Language you speak*.
- **Limits:** this works while Chrome (or Edge) is running, on any website, even when the window is small. It cannot listen
  when Chrome is closed, and it cannot reach apps outside the browser.
- Voice uses Chrome's built-in speech recognition. Google's speech service processes your voice.

## Doing several things at once, and talking while she works

- Say **"Hey Minima, open my WhatsApp and my email"**: she opens both together, in two tabs, and says "Opening WhatsApp and Gmail
  together" straight away. She speaks at the **start** of every step ("Opening Gmail", "Searching the web"), not only at the end.
- **WhatsApp** asks your permission the first time (a card in the panel). Say yes and she turns it on. You still sign in
  yourself (QR code). "My email" opens Gmail unless you name another one (for example "open my Outlook").
- On the free Groq plan she now uses up to three Groq models in turn (each has its own per-minute allowance), so the long
  "pausing 60s" waits are much rarer.

## No permission cards (automatic mode)

By default Minima just does what you ask: she works on every site (except Facebook and Messenger), turns on WhatsApp Web when you
ask for it, and presses Send, Submit, Apply or Confirm without asking. **Payments, buying and deleting always show an approval
card**, and she never types passwords, OTPs or card numbers. If you prefer cards for sending too, tick *Ask me before sending,
submitting or applying* in Settings.

## What to ask

- "Summarize this page" / "What documents do I need here?" / "Find the apply option"
- "Fill this form with my details" (it asks before pressing Submit)
- "What's in my other tabs?" / "Which tab has my electricity bill?"
- "Find the official page for passport renewal and give me the steps" (uses DuckDuckGo)

## Your details (email and phone)

Click the sliders icon in the panel and fill **My details** (name, email, phone, address). Minima uses them only to
fill forms you ask it to fill. They are stored in your browser on this computer and sent to the agent only while
you run a request.

**Minima cannot log in to sites from an email address or phone number, and neither can any other assistant.** Sites
only grant access through your own sign-in. Minima works inside the browser where you are already signed in: open the
site, sign in yourself, then ask. For sign-in passwords, OTPs, card numbers and ID numbers Minima stops and asks you
to type them yourself. It never fills those.

## Want the very best answers? (optional)

Groq's free models are fast but limited (small per-minute allowance, smaller brains). For the strongest answers and no
waiting, use Anthropic's Claude models: open `backend\.env`, copy the 3 lines under "Want the strongest answers" from
`.env.example`, add your key from https://console.anthropic.com/settings/keys (add a little credit there), save, and run
**START-HERE.bat** again. It costs a few cents per task. Remove the 3 lines to go back to free Groq.

## WhatsApp and email

- **Email:** open Gmail or Outlook on the web, sign in yourself, then ask: "summarize my unread mails", "draft a reply to the
  first one". Minima asks before pressing Send.
- **WhatsApp Web:** off by default. Settings, *Messages and email*, tick *Let Minima work on WhatsApp Web*, then refresh the tab.
  She asks before sending any message. Messages from other people are treated as text to read, never as orders.

## Safety

- **Blocked always:** Facebook (`facebook.com`, `fb.com`, `fb.me`) and Messenger. **WhatsApp** is blocked until you switch it on
  (see above). Add more in Settings under *Extra blocked sites*, for example your bank.
- **Per-site permission** before Minima reads or acts on a site, unless you tick *Allow Minima on every site*.
- **Approval cards** before clicking buttons like Submit, Apply, Pay, Confirm, Delete or Send.
- **Privacy:** when you ask something, the visible text of the current page goes to Groq's servers to produce the
  answer. Do not use Minima on pages you would not want a cloud AI service to see: block those sites.
- Only your own browser extension can talk to the agent; websites cannot. Page text is treated as data, not instructions.
- Your data (memory, page index, cache) is stored in `C:\Users\<you>\.navi-everywhere`, outside OneDrive.

## Start automatically with Windows (optional)

- **AUTOSTART-ON.bat** makes the agent start quietly in the background whenever you sign in. Run START-HERE.bat once first.
- **AUTOSTART-OFF.bat** turns that off. **STOP-NAVI.bat** stops the running agent.

## Good to know

- Works in the top page of **Chrome and Edge**. It does not work on browser pages (`chrome://...`), the extension
  stores, PDFs shown in the browser, or inside desktop programs. "Apps" means websites and web apps in your tabs.
- CAPTCHAs and OTP screens need you. Minima tells you when it is waiting for you (the logo shows a yellow dot).
- If the panel says it can't reach the agent, START-HERE.bat is not running.
- Free Groq accounts have per-minute limits. Minima counts what it sends and pauses when needed, so long tasks go slower instead of failing.

## Troubleshooting

| What you see | Fix |
|---|---|
| Logo doesn't appear on a site open before installing | Refresh the page once. |
| "Can't reach the Minima agent" | Double-click START-HERE.bat and keep the window open. |
| "Groq rejected the API key" | Open `backend\.env`, fix the key, restart START-HERE.bat. |
| Rate limit message (429) | Free Groq accounts allow only about 8,000 tokens per minute. Minima now pauses by itself to stay under it (you will see "Staying under Groq's free limit"). If it still says the limit is full, wait one minute and ask a shorter question. If it says the *daily* limit is used up, wait until tomorrow or add billing at console.groq.com/settings/billing/plans. |
| "Groq says the model does not exist" (404) | Groq retires models often. Restart START-HERE.bat; Minima then picks a model your key can use. If it still fails, add the line `NAVI_MODEL=openai/gpt-oss-120b` to `backend\.env`. |
| Python not found | Install Python 3.10+ from python.org and tick *Add python.exe to PATH*. |

## What's inside

```
START-HERE.bat  AUTOSTART-ON.bat  AUTOSTART-OFF.bat  STOP-NAVI.bat  start-navi-hidden.vbs
backend/    server.py (WebSocket)  agent.py (LangGraph: observe, think, act)  tools.py  store.py (Chroma)  web.py (safe fetch)
extension/  manifest.json  overlay.js (logo + panel)  page.js (read/click/type)  background.js (agent link, permissions)
tests/      test_backend.py  test_extension.py (real Chromium)
```

The agent is a LangGraph loop on Groq (it asks Groq which models your key can use and picks one, normally `openai/gpt-oss-120b`, with a smaller fallback): look at the page,
decide on one tool call, act, look again. Tools: page click/type/select/scroll/open, list and read other tabs,
DuckDuckGo search, safe page fetch, calculator, long-term memory and a searchable index of pages you visited
(both in ChromaDB).

Tests: `python tests/test_backend.py` (no key needed) and, on Linux, `xvfb-run -a python tests/test_extension.py`.
