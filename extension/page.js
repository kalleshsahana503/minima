// Minima – page access: "eyes" (snapshot of the page) and "hands" (click / type / select / scroll).
// Runs inside the web page's isolated world. Secret fields are never read and never filled.
(() => {
  if (window.__naviPage) return;
  window.__naviPage = true;

  const INTERACTIVE =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [onclick], [contenteditable="true"]';
  const MAX_ELEMENTS = 45; // small on purpose: free Groq accounts only allow ~8,000 tokens per minute
  const SECRET_RE = /(pass(word|code)?|otp|one.?time|cvv|cvc|card.?(number|no)|cc-|aadhaar|aadhar|\bpan\b|\bssn\b|\bpin\b)/i;

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  };

  const isSecret = (el) => {
    if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return false;
    if (el.type === "password") return true;
    const hint = [el.name, el.id, el.autocomplete, el.getAttribute("aria-label"), el.placeholder].filter(Boolean).join(" ");
    return SECRET_RE.test(hint);
  };

  const labelFor = (el) => {
    const parts = [];
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) parts.push(l.innerText);
    }
    const wrap = el.closest("label");
    if (wrap) parts.push(wrap.innerText);
    parts.push(el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("placeholder"), el.getAttribute("name"));
    if (!["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) parts.push(el.innerText);
    if (el.tagName === "INPUT" && ["button", "submit", "reset"].includes(el.type)) parts.push(el.value);
    return parts.filter(Boolean).join(" | ").replace(/\s+/g, " ").trim().slice(0, 70);
  };

  const snapshot = (opts = {}) => {
    const maxText = opts.maxText || 2200;
    document.querySelectorAll("[data-navi-id]").forEach((e) => e.removeAttribute("data-navi-id"));
    let n = 0;
    const elements = [];
    if (opts.elements !== false) {
      // Keep what is on screen first (that is what the user is looking at), then fill up with the rest, in page order.
      const seen = [];
      let scanned = 0;
      for (const el of document.querySelectorAll(INTERACTIVE)) {
        if (++scanned > 700) break;
        if (!visible(el) || el.disabled) continue;
        const r = el.getBoundingClientRect();
        seen.push({ el, inView: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth });
      }
      const chosen = new Set();
      for (const pass of [true, false]) {
        for (const x of seen) {
          if (chosen.size >= MAX_ELEMENTS) break;
          if (x.inView === pass) chosen.add(x.el);
        }
      }
      for (const { el } of seen) {
        if (!chosen.has(el)) continue;
        const id = ++n;
        el.setAttribute("data-navi-id", String(id));
        const item = { id, tag: el.tagName.toLowerCase(), label: labelFor(el) };
        if (el.tagName === "INPUT") item.type = el.type;
        if (el.tagName === "A") item.href = (el.getAttribute("href") || "").slice(0, 60);
        if (el.tagName === "SELECT") item.options = [...el.options].slice(0, 12).map((o) => o.text.trim().slice(0, 30));
        if (isSecret(el)) item.secret = true;
        else if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
          const v = el.tagName === "SELECT" ? el.options[el.selectedIndex]?.text : el.value;
          if (v) item.value = String(v).slice(0, 60);
        }
        if (el.type === "checkbox" || el.type === "radio") item.checked = el.checked;
        elements.push(item);
      }
    }
    // Visible text, but never the contents of secret inputs (innerText does not include input values anyway).
    const text = (document.body?.innerText || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxText);
    return {
      url: location.href,
      title: document.title,
      scrollY: Math.round(scrollY),
      pageHeight: document.documentElement.scrollHeight,
      text,
      elements,
    };
  };

  // Glowing ring + label on whatever Minima touches, so you can follow along.
  const highlight = (el, label) => {
    const r = el.getBoundingClientRect();
    const host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      .ring{position:fixed;left:${r.left - 5}px;top:${r.top - 5}px;width:${r.width + 10}px;height:${r.height + 10}px;border-radius:12px;
        border:2px solid #2DE2B0;box-shadow:0 0 0 4px rgba(45,226,176,.22),0 0 28px rgba(56,189,248,.6);
        opacity:0;transform:scale(1.1);transition:opacity .35s,transform .35s}
      .ring.on{opacity:1;transform:none}
      .tag{position:absolute;top:-26px;left:0;background:linear-gradient(120deg,#2DE2B0,#38BDF8,#8B5CF6);color:#04101c;font:700 11px system-ui,sans-serif;
        padding:3px 9px;border-radius:7px;white-space:nowrap}
    </style><div class="ring"><div class="tag">Minima · ${label}</div></div>`;
    document.documentElement.appendChild(host);
    const ring = root.querySelector(".ring");
    requestAnimationFrame(() => ring.classList.add("on"));
    setTimeout(() => ring.classList.remove("on"), 1000);
    setTimeout(() => host.remove(), 1500);
  };

  // The Send button of a chat box (WhatsApp shows it only once text is typed).
  const findSend = () => {
    for (const sel of ['[data-testid="compose-btn-send"]', 'button[aria-label="Send" i]', '[role="button"][aria-label="Send" i]', '[aria-label="Send message" i]', '[data-icon="send"]', 'button[data-testid="send"]', 'button[type="submit"]']) {
      const e = document.querySelector(sel);
      if (e) return e.closest('button,[role="button"]') || e;
    }
    return null;
  };

  const find = (id) => document.querySelector(`[data-navi-id="${id}"]`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const setValue = (el, value) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter ? setter.call(el, value) : (el.value = value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const act = async (action, args = {}) => {
    switch (action) {
      case "click": {
        const el = find(args.id);
        if (!el) return { ok: false, error: `No element with id ${args.id}. The page changed: look at the new page view.` };
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        await sleep(350);
        highlight(el, "click");
        await sleep(300);
        el.click();
        return { ok: true, result: `Clicked #${args.id}` };
      }
      case "type": {
        const el = find(args.id);
        if (!el) return { ok: false, error: `No element with id ${args.id}.` };
        if (isSecret(el)) return { ok: false, error: "Refused: Minima never types into password, OTP, card or ID fields. Ask the user to enter it." };
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        await sleep(300);
        highlight(el, "typing");
        el.focus();
        const text = String(args.text ?? "");
        if (el.isContentEditable) {
          // Chat boxes (WhatsApp, Slack, Gmail...) are rich editors that only notice REAL typing. Select everything and "insert text",
          // which fires the same events as typing; setting textContent would show the words but the editor would not know about them.
          const sel = getSelection();
          const r = document.createRange();
          r.selectNodeContents(el);
          sel.removeAllRanges();
          sel.addRange(r);
          let okInsert = false;
          try { okInsert = document.execCommand("insertText", false, text); } catch (e) {}
          if (!okInsert) {
            el.textContent = text;
            el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
          }
        } else setValue(el, text);
        if (!args.press_enter) return { ok: true, result: `Typed into #${args.id}` };
        await sleep(300);
        for (const type of ["keydown", "keypress", "keyup"]) {
          el.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
        }
        const form = el.form;
        if (form && typeof form.requestSubmit === "function") form.requestSubmit();
        if (!el.isContentEditable) return { ok: true, result: `Typed into #${args.id} and pressed Enter` };
        // Websites ignore pretend key presses, so for a chat box also press its Send button, then CHECK that the box emptied.
        await sleep(350);
        const emptied = () => !(el.innerText || el.textContent || "").trim();
        if (!emptied()) {
          const sendBtn = findSend();
          if (sendBtn) { highlight(sendBtn, "send"); sendBtn.click(); }
          for (let i = 0; i < 12 && !emptied(); i++) await sleep(150);
        }
        return emptied()
          ? { ok: true, result: `Typed and SENT (the message box is empty now). Check the chat to confirm the message appears.` }
          : { ok: false, error: "The text is in the message box but it was NOT sent. Tell the user honestly, or find and click the Send button." };
      }
      case "select": {
        const el = find(args.id);
        if (!el || el.tagName !== "SELECT") return { ok: false, error: `#${args.id} is not a dropdown.` };
        const want = String(args.option || "").toLowerCase();
        const opt = [...el.options].find((o) => o.text.trim().toLowerCase() === want) || [...el.options].find((o) => o.text.toLowerCase().includes(want));
        if (!opt) return { ok: false, error: `Option "${args.option}" not found.` };
        highlight(el, "select");
        el.value = opt.value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, result: `Selected "${opt.text.trim()}"` };
      }
      case "scroll": {
        scrollBy({ top: (args.direction === "up" ? -1 : 1) * Math.round(innerHeight * 0.8), behavior: "smooth" });
        await sleep(500);
        return { ok: true, result: `Scrolled ${args.direction || "down"}` };
      }
      default:
        return { ok: false, error: `Unknown action ${action}` };
    }
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "NAVI_SNAPSHOT") {
      sendResponse({ ok: true, snapshot: snapshot(msg.opts) });
    } else if (msg?.type === "NAVI_ACT") {
      act(msg.action, msg.args).then(sendResponse);
      return true;
    } else if (msg?.type === "NAVI_PING") {
      sendResponse({ ok: true });
    }
  });
})();
