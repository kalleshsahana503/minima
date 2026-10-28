// Shared by the background worker and the content scripts.
(function (g) {
  const NAVI = (g.NAVI = g.NAVI || {});

  // Sites Minima never touches. The same list is excluded in manifest.json, so nothing is even injected there.
  NAVI.DEFAULT_BLOCKED = ["facebook.com", "messenger.com", "fb.com", "fb.me"];
  // WhatsApp is allowed by default (you asked for it). Switch it off in Settings > Messages and email to block it.
  NAVI.WHATSAPP = ["whatsapp.com"];
  NAVI.blockedList = (extraText, allowWhatsapp) => [...NAVI.DEFAULT_BLOCKED, ...(allowWhatsapp === false ? NAVI.WHATSAPP : []), ...NAVI.parseHosts(extraText)];

  // "Open my WhatsApp" / "open gmail": answered instantly, without asking the AI (so no waiting and no token limit).
  NAVI.QUICK_SITES = {
    whatsapp: ["WhatsApp", "https://web.whatsapp.com/"], whatsap: ["WhatsApp", "https://web.whatsapp.com/"], watsapp: ["WhatsApp", "https://web.whatsapp.com/"],
    whatsup: ["WhatsApp", "https://web.whatsapp.com/"], "whats app": ["WhatsApp", "https://web.whatsapp.com/"], "what's app": ["WhatsApp", "https://web.whatsapp.com/"],
    "whats up": ["WhatsApp", "https://web.whatsapp.com/"], "g mail": ["Gmail", "https://mail.google.com/"], mails: ["your email", "https://mail.google.com/"], "whatsapp web": ["WhatsApp", "https://web.whatsapp.com/"],
    email: ["your email", "https://mail.google.com/"], mail: ["your email", "https://mail.google.com/"], emails: ["your email", "https://mail.google.com/"],
    gmail: ["Gmail", "https://mail.google.com/"], "google mail": ["Gmail", "https://mail.google.com/"], inbox: ["your inbox", "https://mail.google.com/mail/u/0/#inbox"],
    outlook: ["Outlook", "https://outlook.live.com/mail/"], "yahoo mail": ["Yahoo Mail", "https://mail.yahoo.com/"],
    youtube: ["YouTube", "https://www.youtube.com/"], google: ["Google", "https://www.google.com/"], maps: ["Google Maps", "https://maps.google.com/"],
    "google maps": ["Google Maps", "https://maps.google.com/"], drive: ["Google Drive", "https://drive.google.com/"], "google drive": ["Google Drive", "https://drive.google.com/"],
    calendar: ["Google Calendar", "https://calendar.google.com/"], "google calendar": ["Google Calendar", "https://calendar.google.com/"],
    flipkart: ["Flipkart", "https://www.flipkart.com/"], amazon: ["Amazon", "https://www.amazon.in/"], linkedin: ["LinkedIn", "https://www.linkedin.com/"],
    github: ["GitHub", "https://github.com/"], chatgpt: ["ChatGPT", "https://chatgpt.com/"], colab: ["Colab", "https://colab.research.google.com/"],
    "google colab": ["Colab", "https://colab.research.google.com/"], gemini: ["Gemini", "https://gemini.google.com/"], telegram: ["Telegram", "https://web.telegram.org/"],
    kaggle: ["Kaggle", "https://www.kaggle.com/"], "stack overflow": ["Stack Overflow", "https://stackoverflow.com/"],
  };
  NAVI.quickOpen = function (text) {
    const m = /^\s*(?:(?:hey|hi|ok|okay)\s+\w+[\s,]+)?(?:please\s+)?(?:can|could|will|would)?\s*(?:you\s+)?(?:please\s+)?(?:open|launch|go to|take me to|show me|start)\s+(?:up\s+)?(?:my\s+|the\s+)?([a-z' ]{2,24}?)(?:\s+(?:web|app|website|site|page|account))?(?:\s+(?:please|for me))?\s*[.!?]*\s*$/i.exec(String(text || "").replace(/[\u2019\u2018]/g, "'"));
    if (!m) return null;
    const key = m[1].trim().toLowerCase();
    const hit = NAVI.QUICK_SITES[key] || NAVI.QUICK_SITES[key + " app"];   // "whats app": the word 'app' was taken as a suffix
    return hit ? { name: hit[0], url: hit[1] } : null;
  };

  NAVI.hostMatches = function (host, list) {
    host = (host || "").toLowerCase();
    return list.some((d) => host === d || host.endsWith("." + d));
  };

  NAVI.hostOf = function (url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch (e) {
      return "";
    }
  };

  // Pages Minima can never run on (browser-internal pages, extension stores, local files).
  NAVI.isRestricted = function (url) {
    return (
      !url ||
      !/^https?:/i.test(url) ||
      /^https?:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/i.test(url)
    );
  };

  NAVI.parseHosts = function (text) {
    return String(text || "")
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
      .filter(Boolean);
  };

  // ---- Voice: "Hey Minima, open the next page" -> { wake: true, command: "open the next page" }
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  NAVI.wakeVariants = function (name) {
    name = String(name || "minima").trim().toLowerCase() || "minima";
    const v = new Set([name]);
    // Speech recognition often mishears short names; accept the usual spellings of the default one.
    if (name === "minima") ["minimal", "minimum", "mini ma", "mini mah", "minimah", "minema", "menima", "minnima", "mineema", "mynima", "minimo", "manima", "nima", "mnima", "minimar", "miniman", "mini mum", "mini more", "many ma", "mini mama"].forEach((x) => v.add(x));
    if (name === "navi") ["navy", "nawi", "naavi", "nevi", "nahvi", "nevie", "navvy"].forEach((x) => v.add(x));
    return [...v];
  };
  const lev = (a, b) => {                       // edit distance: how many letters differ
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  const PREFIX = /^\s*(?:hey|hi|hello|ok|okay|hay|yo|hai|hei)[\s,]+/i;
  NAVI.parseVoice = function (text, name) {
    const s = String(text || "").trim();
    const nm = String(name || "minima").trim().toLowerCase() || "minima";
    const norm = s.replace(/[.,!?;:"“”]/g, " "); // same length, so positions still match the original
    const pre = PREFIX.exec(norm);
    const start = pre ? pre[0].length : 0;
    const rest = norm.slice(start);
    const done = (end) => ({ wake: true, command: s.slice(start + end).replace(/^[\s.,!?;:-]+/, "").trim() });
    // 1) the name itself works alone ("Minima, open mail"); its common mishearings need "hey" in front (so "minimal design" is not a call)
    const variants = NAVI.wakeVariants(nm).sort((x, y) => y.length - x.length);
    for (const v of variants) {
      if (v !== nm && !pre) continue;
      const m = new RegExp("^\\s*" + esc(v) + "(?=\\s|$)", "i").exec(rest);
      if (m) return done(m[0].length);
    }
    // 2) anything that sounds close to the name (one or two words), e.g. "hey mnima", "hey mini mah"
    if (pre && nm.length >= 5) {
      const one = /^\s*(\S+)/.exec(rest), two = /^\s*(\S+)\s+(\S+)/.exec(rest);
      for (const [m, word] of [[two, two && two[1] + two[2]], [one, one && one[1]]]) {
        if (m && word && word.length >= 5 && lev(word.toLowerCase(), nm) <= 2) return done(m[0].length);   // 4-letter words like "mini" (Mini Cooper) never count
      }
    }
    return { wake: false, command: s };
  };
  // The speech engine gives several guesses for what you said. If ANY of them is a call to her, it counts.
  NAVI.parseAlts = function (alts, name) {
    const list = (alts || []).map((x) => String(x || "")).filter(Boolean);
    for (const t of list) { const p = NAVI.parseVoice(t, name); if (p.wake) return p; }
    return { wake: false, command: list[0] || "" };
  };
  NAVI.isStopCommand = function (text) {
    return /^\s*(stop|cancel|abort|enough|never ?mind|ruko|aapu)\b/i.test(String(text || ""));
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
