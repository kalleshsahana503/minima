"""Loads the real extension in Chromium, with the real backend (scripted model) and a local test website.

Run (Linux, virtual display):   xvfb-run -a python tests/test_extension.py
"""
import http.server
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
EXT = str(ROOT / "extension")
SHOTS = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="navi_shots_"))
SHOTS.mkdir(parents=True, exist_ok=True)

PAGE = """<!doctype html><html><head><title>Scholarship Portal</title></head><body style="font-family:sans-serif;padding:40px;background:#f4f6fb">
<h1>Scholarship Portal</h1><p>Apply before 30 November. You need an income certificate and marksheet.</p>
<form onsubmit="event.preventDefault();document.getElementById('out').textContent='SUBMITTED:'+document.getElementById('n').value;return false">
<label for="n">Full name</label> <input id="n" name="fullname"><br><br>
<label for="p">Password</label> <input id="p" type="password"><br><br>
<button type="submit">Submit application</button></form><div id="out"></div><p><a href="/second">Next page</a></p></body></html>"""
SECOND = "<!doctype html><title>Second page</title><body style='font-family:sans-serif;padding:40px'><h1>Second page</h1><a href='/'>Back</a></body>"


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = (SECOND if self.path.startswith("/second") else PAGE).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 8800), H)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

server = subprocess.Popen([sys.executable, "-I", str(ROOT / "tests" / "run_fake_server.py")], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
time.sleep(4)

results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))


try:
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            tempfile.mkdtemp(prefix="navi_prof_"),
            headless=False,
            viewport={"width": 1280, "height": 800},
            args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}", "--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
        )
        errors = []
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=10000)
        sw.evaluate("chrome.storage.local.set({serverUrl:'ws://127.0.0.1:8765/ws', trustAll:false, askFirst:true, rememberPages:true, voiceWake:false})")  # ears stay quiet until the voice section below

        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("page: " + str(e)))
        page.goto("http://localhost:8800/")
        page.wait_for_selector("#navi-everywhere-root .fab", timeout=8000)
        check("floating logo appears on a normal website", True)
        for _ in range(40):                                # the one-time microphone page opens at install and closes itself
            if not any("voice.html" in pg.url for pg in ctx.pages):
                break
            time.sleep(0.25)
        time.sleep(2.5)                                    # let the listener restart quietly (voiceWake=false) before dragging
        sw.evaluate("chrome.storage.local.set({micGranted:false}).then(() => chrome.offscreen.closeDocument()).catch(() => {})")  # no listener while testing the drag
        time.sleep(0.8)
        page.bring_to_front()
        page.wait_for_timeout(900)
        page.screenshot(path=str(SHOTS / "1_logo_on_page.png"))

        # --- drag the logo
        box = page.locator("#navi-everywhere-root .fab").bounding_box()
        page.mouse.move(box["x"] + 30, box["y"] + 30)
        page.mouse.down()
        page.mouse.move(box["x"] - 300, box["y"] - 250, steps=8)
        page.mouse.up()
        box2 = box
        for _ in range(25):                                # wait for the snap animation to finish (slow test machines)
            page.wait_for_timeout(200)
            box2 = page.locator("#navi-everywhere-root .fab").bounding_box()
            if abs(box2["y"] - box["y"]) > 100:
                break
        check("logo can be dragged and snaps to a side", abs(box2["y"] - box["y"]) > 100, f"{box} -> {box2}")
        panel_open = page.evaluate("document.querySelector('#navi-everywhere-root').shadowRoot.querySelector('.panel').classList.contains('open')")
        check("dragging does not open the panel", not panel_open)

        # --- click the logo -> panel opens
        page.locator("#navi-everywhere-root .fab").click()
        page.wait_for_selector("#navi-everywhere-root .panel.open", timeout=4000)
        check("clicking the logo opens the assistant", True)
        page.wait_for_timeout(900)
        page.screenshot(path=str(SHOTS / "2_panel_open.png"))

        # --- goal 1 with permission + approval
        box_in = page.locator("#navi-everywhere-root .box textarea")
        box_in.fill("Fill the form with my name and submit it")
        box_in.press("Enter")
        page.wait_for_selector("#navi-everywhere-root .sheet", timeout=8000)
        check("asks permission the first time on a site", True)
        page.screenshot(path=str(SHOTS / "3_permission.png"))
        page.locator("#navi-everywhere-root .sheet [data-c=once]").click()
        page.wait_for_selector("#navi-everywhere-root .card", timeout=15000)
        card_text = page.locator("#navi-everywhere-root .card").first.inner_text()
        check("risky click (Submit) asks for approval", "Submit application" in card_text, card_text)
        page.screenshot(path=str(SHOTS / "4_approval.png"))
        page.locator("#navi-everywhere-root .card .btn.p").first.click()
        page.wait_for_selector("#navi-everywhere-root .msg.agent .bubble a", timeout=15000)
        page.wait_for_timeout(1500)
        out = page.inner_text("#out")
        check("agent typed the name and submitted the form on the real page", out == "SUBMITTED:Asha Rao", out)
        pw = page.evaluate("document.getElementById('p').value")
        check("password field untouched", pw == "")
        bubble = page.locator("#navi-everywhere-root .msg.agent .bubble").last.inner_text()
        check("final answer shown (markdown rendered)", "Asha Rao" in bubble, bubble)
        page.screenshot(path=str(SHOTS / "5_done.png"))

        # --- goal 2: a click navigates; the chat must survive
        box_in.fill("Open the next page")
        box_in.press("Enter")
        page.wait_for_url("**/second", timeout=15000)
        page.wait_for_selector("#navi-everywhere-root .panel.open", timeout=8000)
        page.wait_for_function(
            "document.querySelector('#navi-everywhere-root')?.shadowRoot.querySelector('.feed').innerText.includes('second page now')",
            timeout=20000,
        )
        feed = page.evaluate("document.querySelector('#navi-everywhere-root').shadowRoot.querySelector('.feed').innerText")
        check("panel stays open and the chat survives page navigation", "Fill the form" in feed and "second page now" in feed)
        page.screenshot(path=str(SHOTS / "6_after_navigation.png"))

        # --- goal 3: other tabs
        other = ctx.new_page()
        other.goto("http://localhost:8800/")
        other.wait_for_selector("#navi-everywhere-root .fab")
        page.bring_to_front()
        page.locator("#navi-everywhere-root .box textarea").fill("What tabs do I have open?")
        page.locator("#navi-everywhere-root .box textarea").press("Enter")
        page.wait_for_function(
            "document.querySelector('#navi-everywhere-root')?.shadowRoot.querySelector('.feed').innerText.includes('these tabs open')",
            timeout=20000,
        )
        steps = page.evaluate("document.querySelector('#navi-everywhere-root').shadowRoot.querySelector('.feed').innerText")
        check("agent can look at the user's other tabs", "open tabs" in steps.lower())

        # --- toolbar button / shortcut path closes and reopens
        tab_id = sw.evaluate("chrome.tabs.query({url:'http://localhost:8800/second'}).then(t=>t[0].id)")
        sw.evaluate(f"chrome.tabs.sendMessage({tab_id}, {{type:'NAVI_TOGGLE'}})")
        page.wait_for_timeout(700)
        closed = not page.evaluate("document.querySelector('#navi-everywhere-root').shadowRoot.querySelector('.panel').classList.contains('open')")
        check("toolbar button / shortcut toggles the panel", closed)

        # --- blocked sites + any other site
        def serve(route):
            route.fulfill(status=200, content_type="text/html", body="<title>x</title><body><h1>Hello</h1>")

        ctx.route("https://web.whatsapp.com/**", serve)
        ctx.route("https://www.facebook.com/**", serve)
        ctx.route("https://www.messenger.com/**", serve)
        ctx.route("https://mail.example.test/**", serve)
        sw.evaluate("chrome.storage.local.set({allowWhatsapp:false})")   # WhatsApp is ON by default; switching it off in Settings must block it
        for name, url in [("WhatsApp (when you switch it off)", "https://web.whatsapp.com/"), ("Facebook", "https://www.facebook.com/"), ("Messenger", "https://www.messenger.com/")]:
            t = ctx.new_page()
            t.goto(url)
            t.wait_for_timeout(1800)
            check(f"no Minima logo on {name}", t.locator("#navi-everywhere-root").count() == 0)
            t.close()
        sw.evaluate("chrome.storage.local.remove('allowWhatsapp')")      # back to the default: ON
        w = ctx.new_page()
        w.goto("https://web.whatsapp.com/")
        w.wait_for_selector("#navi-everywhere-root .fab", timeout=8000)
        check("WhatsApp Web works once you switch it on in Settings", True)
        w.close()
        sw.evaluate("chrome.storage.local.remove('allowWhatsapp')")   # leave WhatsApp at its default (ON)
        t = ctx.new_page()
        t.goto("https://mail.example.test/")
        t.wait_for_selector("#navi-everywhere-root .fab", timeout=6000)
        check("logo appears on any other website", True)

        # --- a leftover logo from an old copy of the extension (e.g. after "reload") must not become a second logo
        d = ctx.new_page()
        d.add_init_script("document.addEventListener('DOMContentLoaded',()=>{const o=document.createElement('div');o.id='navi-everywhere-root';document.documentElement.appendChild(o)})")
        d.goto("https://mail.example.test/")
        d.wait_for_selector("#navi-everywhere-root .fab", timeout=6000)
        d.wait_for_timeout(500)
        check("only ONE logo even with a leftover old one", d.locator("#navi-everywhere-root").count() == 1)
        d.close()

        # --- voice: a spoken command reaches the page you are on, and the answer is spoken back
        sw.evaluate("chrome.storage.local.set({trustAll:true, speakAnswers:true, voiceLang:'en-IN'})")
        ext_id = sw.url.split("/")[2]
        vt = ctx.new_page()
        vt.goto(f"chrome-extension://{ext_id}/voice.html?test=1")
        vt.wait_for_selector("#state", timeout=4000)
        check("one-time microphone page opens (and says what it is for)", "microphone" in vt.inner_text("h1").lower())
        vp = ctx.new_page()
        vp.goto("http://localhost:8800/")
        vp.wait_for_selector("#navi-everywhere-root .fab", timeout=8000)
        vp.bring_to_front()
        vp.wait_for_timeout(600)
        vt.evaluate("chrome.runtime.sendMessage({type:'NAVI_VOICE', kind:'command', text:'what is on this page'})")
        vp.wait_for_function(
            "document.querySelector('#navi-everywhere-root')?.shadowRoot.querySelector('.feed').innerText.includes('Voice works')", timeout=25000)
        vfeed = vp.evaluate("document.querySelector('#navi-everywhere-root').shadowRoot.querySelector('.feed').innerText")
        check("spoken command shows up as your message and gets answered", "what is on this page" in vfeed)
        said = vp.evaluate("document.querySelector('#navi-everywhere-root').dataset.lastSpoken || ''")
        check("answer is spoken (links and markdown removed)", "Voice works" in said and "http" not in said and "*" not in said, said)
        vp.close(); vt.close()

        # --- Siri-style: with the microphone allowed, the listener is an INVISIBLE offscreen page, not a tab
        sw.evaluate("chrome.storage.local.set({micGranted:true, voiceWake:true})")
        got = False
        for _ in range(20):
            got = sw.evaluate("chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']}).then(c => c.length > 0)")
            if got:
                break
            time.sleep(0.3)
        check("hands-free listener runs invisibly in the background (no tab)", got is True)
        for pg in ctx.pages:                       # the one-time setup page (opened at install) may still be around
            if "voice.html" in pg.url:
                pg.close()
        sw.evaluate("chrome.storage.local.set({voiceName:'Minima'})")   # restarts the listener with new settings
        time.sleep(1.0)
        check("no 'listening' tab is open", not any("voice.html" in pg.url for pg in ctx.pages))
        alive = False
        for _ in range(20):
            alive = sw.evaluate("chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']}).then(c => c.length > 0)")
            if alive:
                break
            time.sleep(0.3)
        check("listener survives a settings change", alive is True)

        # --- her name is Minima (and speech engines' usual mishearings still wake her)
        np_ = ctx.new_page()
        np_.goto("http://localhost:8800/")
        np_.add_script_tag(content=(ROOT / "extension" / "shared.js").read_text(encoding="utf-8"))
        qo = np_.evaluate("""() => ['hey minima can you open my whatsapp', 'open gmail', 'Open my email please', 'open my facebook', 'open flipkart and buy shoes'].map(x => NAVI.quickOpen(x))""")
        check("'open my whatsapp' and 'open my email' are understood instantly", qo[0] and qo[0]["url"].find("web.whatsapp.com") >= 0 and qo[1]["url"].find("mail.google.com") >= 0 and qo[2]["url"].find("mail.google.com") >= 0, str(qo))
        check("anything more than 'open X' still goes to the AI (and Facebook is not a shortcut)", qo[3] is None and qo[4] is None, str(qo[3:]))
        qo = np_.evaluate("""() => ['hey minima can you open my whatsap', 'open whatsapp please', "open what's app", 'open my email', 'open flipkart'].map(x => NAVI.quickOpen(x) && NAVI.quickOpen(x).url)""")
        check("'open my whatsap / email' is understood instantly (even a typo)", qo[0] and "whatsapp.com" in qo[0] and "whatsapp" in qo[1] and "whatsapp" in qo[2] and "mail.google.com" in qo[3], str(qo))
        res = np_.evaluate("""() => ['Hey Minima open my mail', 'hey minimal, what is this page', 'Hey mini ma find jeans', 'hello world'].map(x => NAVI.parseVoice(x, 'Minima'))""")
        check("'Hey Minima ...' wakes her and keeps the command", res[0] == {"wake": True, "command": "open my mail"}, str(res[0]))
        check("mishearings of Minima still wake her", res[1]["wake"] and res[1]["command"].startswith("what is") and res[2]["wake"] and res[2]["command"] == "find jeans", str(res[1:3]))
        check("other sentences do not wake her", res[3]["wake"] is False)
        pos = np_.evaluate("""() => ['hey minima open mail','Minima open mail','hey mnima open mail','hey mini mah find shoes','ok minimal send hi','hey nima what time','hay minimum open mail'].map(x => NAVI.parseVoice(x, 'Minima'))""")
        neg = np_.evaluate("""() => ['minimal design looks good','what is minimum wage','hey there how are you','minister of finance is here','hello world','hey mini cooper is nice'].map(x => NAVI.parseVoice(x, 'Minima').wake)""")
        check("forgiving: 7 ways of saying her name all wake her", all(r["wake"] and r["command"] for r in pos), str(pos))
        check("careful: ordinary sentences never wake her", not any(neg), str(neg))
        alt = np_.evaluate("""() => NAVI.parseAlts(['hay money open mail', 'hey minima open mail'], 'Minima')""")
        check("any of the engine's guesses can wake her", alt["wake"] and alt["command"] == "open mail", str(alt))
        np_.close()

        # --- the mic button: starts listening at once (through the always-on voice tab), pressing again cancels
        mp = ctx.new_page()
        mp.goto("http://localhost:8800/")
        mp.wait_for_selector("#navi-everywhere-root .fab", timeout=8000)
        mp.evaluate("document.querySelector('#navi-everywhere-root').shadowRoot.querySelector('.fab').click()")
        mp.wait_for_timeout(500)
        MIC = "document.querySelector('#navi-everywhere-root').shadowRoot.querySelector('[data-act=mic]')"
        mp.evaluate(MIC + ".click()")
        mp.wait_for_timeout(800)
        check("mic button starts listening straight away", mp.evaluate(MIC + ".classList.contains('on')") is True)
        mp.evaluate(MIC + ".click()")
        mp.wait_for_timeout(500)
        check("pressing the mic again stops it", mp.evaluate(MIC + ".classList.contains('on')") is False)
        title = mp.evaluate("document.querySelector('#navi-everywhere-root').shadowRoot.querySelector('.panel').getAttribute('aria-label')")
        check("panel is named Minima", title == "Minima assistant", title)
        # typing "open my whatsapp" opens it at once (no AI step, so no waiting)
        n_before = len(ctx.pages)
        mp.evaluate("""() => { const r = document.querySelector('#navi-everywhere-root').shadowRoot; const t = r.querySelector('.box textarea'); t.value = 'hey minima can you open my whatsapp'; t.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})); }""")
        opened = False
        for _ in range(40):
            if sw.evaluate("chrome.tabs.query({}).then(ts => ts.some(t => ((t.url || '') + (t.pendingUrl || '')).includes('web.whatsapp.com')))"):
                opened = True
                break
            time.sleep(0.25)
        feed_txt = mp.evaluate("document.querySelector('#navi-everywhere-root').shadowRoot.querySelector('.feed').innerText")
        check("'open my whatsapp' opens WhatsApp Web instantly", opened, feed_txt[-200:] + " | tabs: " + str(sw.evaluate("chrome.tabs.query({}).then(ts => ts.map(t => (t.url || t.pendingUrl || '').slice(0, 40)))")) + " | blocked: " + str(sw.evaluate("getSettings().then(s => s.blocked)")))
        sw.evaluate("chrome.tabs.query({}).then(ts => ts.filter(t => ((t.url || '') + (t.pendingUrl || '')).includes('web.whatsapp.com')).forEach(t => chrome.tabs.remove(t.id)))")
        vt2 = ctx.new_page()
        vt2.goto(f"chrome-extension://{ext_id}/voice.html?test=1")
        check("voice page shows a live microphone meter", vt2.locator("#lvl").count() == 1 and vt2.locator("#mic").count() == 1)
        vt2.close()
        mp.close()

        # --- user-added blocked site disappears immediately
        sw.evaluate("chrome.storage.local.set({extraBlocked:'example.test'})")
        t.wait_for_timeout(1000)
        check("a site you block removes the logo straight away", t.locator("#navi-everywhere-root").count() == 0)

        check("no JavaScript errors on the page", not errors, "; ".join(errors[:3]))
        ctx.close()
finally:
    server.terminate()
    out = server.stdout.read().decode(errors="ignore") if server.stdout else ""
    bad = [l for l in out.splitlines() if "Traceback" in l or "Error" in l]
    if bad:
        print("SERVER LOG ISSUES:", bad[:5])
    httpd.shutdown()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed. Screenshots: {SHOTS}")
sys.exit(1 if failed else 0)
