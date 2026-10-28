// Minima – background service worker.
// * keeps one WebSocket per tab to the Minima agent (so the chat survives page navigations)
// * performs the agent's requests: read page, click/type, open tabs, list/read other tabs
// * enforces the blocklist and the per-site permission, whatever the agent asks for
importScripts("shared.js");

const DEFAULT_SERVER = "ws://127.0.0.1:8000/ws";
const MAX_LOG = 300;

const states = new Map(); // tabId -> Promise<state>
const waiters = new Map(); // permission id -> {resolve}
const sessionAllowed = new Set();
const sessionDenied = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ per-tab state */
function T(tabId) {
  if (!states.has(tabId)) {
    states.set(
      tabId,
      (async () => {
        const key = "tab:" + tabId;
        let saved = {};
        try {
          saved = (await chrome.storage.session.get(key))[key] || {};
        } catch (e) {}
        return { tabId, log: saved.log || [], open: !!saved.open, running: false, target: null, ws: null, port: null, perm: new Map(), saveTimer: null };
      })()
    );
  }
  return states.get(tabId);
}

function persist(s) {
  clearTimeout(s.saveTimer);
  s.saveTimer = setTimeout(() => {
    chrome.storage.session.set({ ["tab:" + s.tabId]: { log: s.log.slice(-MAX_LOG), open: s.open } }).catch(() => {});
  }, 300);
}

function push(s, ev) {
  s.log.push(ev);
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
  persist(s);
  try {
    s.port?.postMessage({ type: "event", ev });
  } catch (e) {}
}

/* ------------------------------------------------------------------ settings & permissions */
async function getSettings() {
  const v = await chrome.storage.local.get(["extraBlocked", "trustAll", "allowedHosts", "profile", "rememberPages", "serverUrl", "token", "allowWhatsapp", "askFirst"]);
  return {
    blocked: NAVI.blockedList(v.extraBlocked, v.allowWhatsapp),
    trustAll: v.trustAll !== false,          // on by default: Minima works on every site except the blocked ones
    auto: !v.askFirst,                       // on by default: she just does it (payments and deletions still ask)
    allowedHosts: v.allowedHosts || [],
    profile: v.profile || "",
    rememberPages: v.rememberPages !== false,
    serverUrl: v.serverUrl || DEFAULT_SERVER,
    token: v.token || "",
  };
}

const isBlocked = (settings, url) => NAVI.hostMatches(NAVI.hostOf(url), settings.blocked);

async function askPermission(s, host) {
  const id = Math.random().toString(36).slice(2, 10);
  s.perm.set(id, host);
  try {
    s.port?.postMessage({ type: "permission_request", id, host });
  } catch (e) {}
  const choice = await new Promise((resolve) => {
    waiters.set(id, { resolve });
    setTimeout(() => resolve("deny"), 3 * 60 * 1000);
  });
  waiters.delete(id);
  s.perm.delete(id);
  return choice;
}

async function requireAllowed(s, settings, host) {
  if (settings.trustAll || sessionAllowed.has(host) || NAVI.hostMatches(host, settings.allowedHosts)) return;
  if (sessionDenied.has(host)) throw new Error(`The user did not allow Minima to use ${host}.`);
  const choice = await askPermission(s, host);
  if (choice === "deny") {
    sessionDenied.add(host);
    throw new Error(`The user did not allow Minima to use ${host}.`);
  }
  if (choice === "always") {
    const { allowedHosts = [] } = await chrome.storage.local.get("allowedHosts");
    await chrome.storage.local.set({ allowedHosts: [...new Set([...allowedHosts, host])] });
  } else sessionAllowed.add(host);
}

/* ------------------------------------------------------------------ talking to pages */
function waitForLoad(tabId, timeout = 15000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      setTimeout(resolve, 500); // let single-page apps settle
    };
    const listener = (id, info) => id === tabId && info.status === "complete" && finish();
    chrome.tabs.onUpdated.addListener(listener);
    const timer = setTimeout(finish, timeout);
    chrome.tabs.get(tabId).then((t) => t.status === "complete" && finish()).catch(finish);
  });
}

async function ensureContent(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "NAVI_PING" });
  } catch (e) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["shared.js", "page.js"] });
  }
}

async function usableTab(s, settings, targetId) {
  let tab = await chrome.tabs.get(targetId);
  if (tab.status === "loading") await waitForLoad(targetId);
  tab = await chrome.tabs.get(targetId);
  if (NAVI.isRestricted(tab.url)) throw new Error("Minima can't read this kind of page (browser-internal or extension-store page).");
  if (isBlocked(settings, tab.url)) throw new Error("Minima does not work on this site (it is on the blocked list).");
  await requireAllowed(s, settings, NAVI.hostOf(tab.url));
  await ensureContent(targetId);
  return tab;
}

/* ------------------------------------------------------------------ the agent's requests */
async function doRequest(s, m) {
  const settings = await getSettings();
  const cur = s.target ?? s.tabId;

  switch (m.kind) {
    case "snapshot": {
      const tab = await usableTab(s, settings, cur);
      return await chrome.tabs.sendMessage(tab.id, { type: "NAVI_SNAPSHOT", opts: {} });
    }
    case "action": {
      const tab = await usableTab(s, settings, cur);
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: "NAVI_ACT", action: m.action, args: m.args });
        if (m.action === "click") await sleep(900); // let navigation / rendering start
        return res;
      } catch (e) {
        if (m.action === "click") {
          await waitForLoad(tab.id); // a click that navigates closes the message channel: that is success
          return { ok: true, result: "Clicked (the page changed)." };
        }
        throw e;
      }
    }
    case "enable_whatsapp": {                 // the user said yes to the approval card
      await chrome.storage.local.set({ allowWhatsapp: true });
      return { ok: true, result: "WhatsApp Web is on." };
    }
    case "navigate": {
      const url = String(m.args.url || "");
      if (!/^https?:\/\//i.test(url)) return { ok: false, error: "Only http(s) addresses can be opened." };
      if (isBlocked(settings, url)) return { ok: false, error: "Minima does not work on that site (it is on the blocked list)." };
      await requireAllowed(s, settings, NAVI.hostOf(url));
      if (m.args.new_tab) {
        const t = await chrome.tabs.create({ url, active: true });
        s.target = t.id;
        await waitForLoad(t.id);
      } else {
        await chrome.tabs.update(cur, { url });
        await waitForLoad(cur);
      }
      return { ok: true, result: "Opened " + url };
    }
    case "list_tabs": {
      const all = await chrome.tabs.query({});
      const tabs = all
        .filter((t) => !NAVI.isRestricted(t.url) && !isBlocked(settings, t.url))
        .map((t) => ({ id: t.id, title: t.title || "", url: t.url, active: t.id === cur }));
      return { ok: true, tabs };
    }
    case "read_tab": {
      const id = Number(m.args.tab_id);
      const tab = await usableTab(s, settings, id);
      return await chrome.tabs.sendMessage(tab.id, { type: "NAVI_SNAPSHOT", opts: { elements: false, maxText: 2200 } });
    }
    case "switch_tab": {
      const id = Number(m.args.tab_id);
      const tab = await chrome.tabs.get(id);
      if (NAVI.isRestricted(tab.url) || isBlocked(settings, tab.url)) return { ok: false, error: "Minima can't use that tab." };
      await chrome.tabs.update(id, { active: true });
      try {
        await chrome.windows.update(tab.windowId, { focused: true });
      } catch (e) {}
      s.target = id;
      return { ok: true, result: "Now working on tab " + id };
    }
    default:
      return { ok: false, error: "Unknown request " + m.kind };
  }
}

async function handleRequest(s, m) {
  let data;
  try {
    data = await doRequest(s, m);
  } catch (e) {
    data = { ok: false, error: String(e?.message || e) };
  }
  try {
    s.ws?.send(JSON.stringify({ type: "result", id: m.id, data }));
  } catch (e) {}
}

/* ------------------------------------------------------------------ WebSocket to the agent */
async function ensureWs(s) {
  if (s.ws && s.ws.readyState === WebSocket.OPEN) return s.ws;
  const settings = await getSettings();
  let url = settings.serverUrl;
  if (settings.token) url += (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(settings.token);
  return new Promise((resolve, reject) => {
    let opened = false;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      return reject(new Error("The agent address in Settings is not valid: " + url));
    }
    ws.onopen = () => {
      opened = true;
      s.ws = ws;
      resolve(ws);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (s.ws === ws) s.ws = null;
      if (!opened) return reject(new Error("Can't reach the Minima agent at " + url + ". Is START-HERE.bat running?"));
      if (s.running) {
        s.running = false;
        push(s, { type: "error", text: "The connection to the Minima agent was lost." });
      }
    };
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      onServerMessage(s, m);
    };
  });
}

function onServerMessage(s, m) {
  if (m.type === "request") return void handleRequest(s, m);
  if (m.type === "pong") return;
  if (m.type === "final" || m.type === "error") s.running = false;
  push(s, m);
}

async function startGoal(s, text) {
  if (s.running && s.ws) s.ws.send(JSON.stringify({ type: "stop" }));
  sessionDenied.clear();
  s.target = null;
  push(s, { type: "user", text });
  s.running = true;
  try {
    const ws = await ensureWs(s);
    const settings = await getSettings();
    const tab = await chrome.tabs.get(s.tabId);
    ws.send(JSON.stringify({ type: "goal", text, profile: settings.profile, remember: settings.rememberPages, auto: settings.auto, url: tab.url, title: tab.title }));
  } catch (e) {
    s.running = false;
    push(s, { type: "error", text: String(e?.message || e) });
  }
}

/* ------------------------------------------------------------------ messages from the in-page panel */
async function onPanelMessage(s, port, m) {
  switch (m.type) {
    case "hello":
      port.postMessage({ type: "replay", events: s.log, running: s.running, open: s.open });
      for (const [id, host] of s.perm) port.postMessage({ type: "permission_request", id, host });
      break;
    case "goal":
      startGoal(s, String(m.text || "").slice(0, 2000));
      break;
    case "stop":
      s.ws?.send(JSON.stringify({ type: "stop" }));
      s.running = false;
      push(s, { type: "stopped" });
      break;
    case "approval":
      s.ws?.send(JSON.stringify({ type: "approval", id: m.id, allow: !!m.allow }));
      push(s, { type: "resolved", id: m.id, text: m.allow ? "Allowed" : "Denied" });
      break;
    case "answer":
      s.ws?.send(JSON.stringify({ type: "answer", id: m.id, text: String(m.text || "") }));
      push(s, { type: "resolved", id: m.id, text: "You: " + String(m.text || "") });
      break;
    case "permission_response":
      waiters.get(m.id)?.resolve(m.choice);
      break;
    case "open_state":
      s.open = !!m.open;
      persist(s);
      break;
    case "reset":
      s.log = [];
      s.target = null;
      s.running = false;
      s.ws?.send(JSON.stringify({ type: "reset" }));
      persist(s);
      break;
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "navi-panel" || !port.sender?.tab) return;
  const tabId = port.sender.tab.id;
  T(tabId).then((s) => {
    s.port = port;
    port.onMessage.addListener((m) => onPanelMessage(s, port, m));
    port.onDisconnect.addListener(() => {
      if (s.port === port) s.port = null;
    });
  });
});

/* ------------------------------------------------------------------ toolbar button, shortcut, lifecycle */
const OVERLAY_FILES = ["shared.js", "page.js", "overlay.js"];

async function toggleOn(tab) {
  if (!tab?.id) return;
  const settings = await getSettings();
  const blocked = NAVI.isRestricted(tab.url) || isBlocked(settings, tab.url);
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "NAVI_TOGGLE" });
  } catch (e) {
    if (blocked) {
      chrome.action.setBadgeBackgroundColor({ color: "#FB7185", tabId: tab.id });
      chrome.action.setBadgeText({ text: "×", tabId: tab.id });
      setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 2500);
      return;
    }
    try {
      // The page was open before Minima was installed or updated: inject it now.
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: OVERLAY_FILES });
      await sleep(250);
      await chrome.tabs.sendMessage(tab.id, { type: "NAVI_TOGGLE" });
    } catch (err) {}
  }
}

chrome.action.onClicked.addListener(toggleOn);
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "toggle-navi") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  toggleOn(tab);
});

chrome.runtime.onInstalled.addListener(async () => {
  // Hands-free ("Hey Minima") is ON by default. One small pinned tab keeps the microphone open; it asks for permission once.
  const { voiceWake } = await chrome.storage.local.get("voiceWake");
  if (voiceWake === undefined) await chrome.storage.local.set({ voiceWake: true });
  const { micGranted } = await chrome.storage.local.get("micGranted");
  if (voiceWake !== false && !micGranted) openSetupTab(false);   // one-time microphone permission
  // Put the Minima logo on tabs that are already open, so nothing needs a refresh.
  const settings = await getSettings();
  for (const t of await chrome.tabs.query({})) {
    if (NAVI.isRestricted(t.url) || isBlocked(settings, t.url)) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: OVERLAY_FILES });
    } catch (e) {}
  }
});

// A click that opens a link in a NEW tab: follow it, so the agent keeps working where the user is.
chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.openerTabId == null) return;
  for (const p of states.values()) {
    const s = await p;
    if (s.running && (s.target ?? s.tabId) === tab.openerTabId) s.target = tab.id;
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (!states.has(tabId)) return;
  const s = await states.get(tabId);
  try {
    s.ws?.close();
  } catch (e) {}
  states.delete(tabId);
  chrome.storage.session.remove("tab:" + tabId).catch(() => {});
});

// Keeps the service worker (and the sockets) alive while an agent is working.
setInterval(() => {
  for (const p of states.values())
    p.then((s) => {
      if (s.ws?.readyState === WebSocket.OPEN) s.ws.send('{"type":"ping"}');
    });
}, 20000);


/* ------------------------------------------------------------------ voice: invisible "ears" + routing to the page you are on */
const SETUP_URL = chrome.runtime.getURL("voice.html");
let lastWebTab = null;

async function findSetupTab() {
  return (await chrome.tabs.query({})).find((t) => (t.url || "").startsWith(SETUP_URL));
}

// The microphone must be allowed once, by you, on a normal page (browser rule). This opens that page; it closes itself afterwards.
async function openSetupTab(test) {
  const t = await findSetupTab();
  if (t) { try { await chrome.tabs.update(t.id, { active: true }); } catch (e) {} return t; }
  const [cur] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (cur?.id) chrome.storage.session.set({ voiceReturn: cur.id });
  return chrome.tabs.create({ url: SETUP_URL + (test ? "?test=1" : ""), active: true });
}

async function earsRunning() {
  try { return (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length > 0; } catch (e) { return false; }
}

let earsBusy = Promise.resolve();
// Starts the invisible listener (no tab, no window). force = restart it so new name/language settings apply.
function startEars(force) {
  earsBusy = earsBusy.then(async () => {
    const v = await chrome.storage.local.get(["voiceWake", "voiceName", "voiceLang", "micGranted"]);
    if (!v.micGranted || !chrome.offscreen) return false;
    if (await earsRunning()) {
      if (!force) return true;
      try { await chrome.offscreen.closeDocument(); } catch (e) {}
    }
    const q = new URLSearchParams({ name: v.voiceName || "Minima", lang: v.voiceLang || "en-IN", wake: v.voiceWake === false ? "0" : "1" });
    for (let i = 0; i < 4; i++) {                       // closing and opening right after each other can need a second try
      try {
        await chrome.offscreen.createDocument({ url: "ears.html?" + q, reasons: ["USER_MEDIA"], justification: "Listen for the wake word so Minima answers hands-free." });
        return true;
      } catch (e) {
        if (/single offscreen/i.test(String(e))) return true;
        await sleep(400);
      }
    }
    return false;
  }).catch(() => false);
  return earsBusy;
}
startEars(false); // every time the background wakes up: make sure the ears are on

async function voiceTarget() {
  const act = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  let t = act.find((x) => /^https?:/i.test(x.url || ""));
  if (!t) {
    const id = lastWebTab ?? (await chrome.storage.session.get("lastWeb")).lastWeb;
    if (id != null) { try { t = await chrome.tabs.get(id); } catch (e) {} }
  }
  return t;
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const t = await chrome.tabs.get(tabId);
    if (/^https?:/i.test(t.url || "")) { lastWebTab = tabId; chrome.storage.session.set({ lastWeb: tabId }); }
  } catch (e) {}
});

async function sendToTab(tab, msg) {
  try {
    await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: OVERLAY_FILES });
      await sleep(500);
      await chrome.tabs.sendMessage(tab.id, msg);
    } catch (err) {}
  }
}

chrome.runtime.onMessage.addListener((m, sender) => {
  if (!m || sender.id !== chrome.runtime.id) return;
  (async () => {
    if (m.type === "NAVI_VOICE") {
      if (m.kind === "granted") {                                  // the one-time microphone page: done
        await chrome.storage.local.set({ micGranted: true });
        if (!m.test && sender.tab?.id != null) {
          try { await chrome.tabs.remove(sender.tab.id); } catch (e) {}
          const { voiceReturn } = await chrome.storage.session.get("voiceReturn");
          if (voiceReturn != null) { try { await chrome.tabs.update(voiceReturn, { active: true }); } catch (e) {} }
        }
        await startEars(true);
        return;
      }
      const tab = await voiceTarget();
      if (!tab) return;
      const settings = await getSettings();
      if (NAVI.isRestricted(tab.url) || isBlocked(settings, tab.url)) return; // never act on Facebook / blocked sites
      await sendToTab(tab, { type: "NAVI_VOICE_GOAL", kind: m.kind, text: m.text || "" });
    } else if (m.type === "NAVI_QUICK_OPEN") {                      // "open my whatsapp": instant, no AI involved
      const url = String(m.url || "");
      const settings = await getSettings();
      if (!/^https:\/\//i.test(url) || isBlocked(settings, url)) return;
      await chrome.tabs.create({ url, active: true });
    } else if (m.type === "NAVI_VOICE_ENSURE") {                    // the panel was opened: make sure the ears are on
      await startEars(false);
    } else if (m.type === "NAVI_VOICE_TEST") {                      // Settings > Microphone check
      await openSetupTab(true);
    } else if (m.type === "NAVI_VOICE_START") {                     // the mic button in the panel
      const { micGranted } = await chrome.storage.local.get("micGranted");
      if (!micGranted) { await openSetupTab(false); return; }
      const had = await earsRunning();
      await startEars(false);
      await sleep(had ? 50 : 700);
      chrome.runtime.sendMessage({ type: "NAVI_VOICE_CTL", listenOnce: true }).catch(() => {});
    } else if (m.type === "NAVI_VOICE_STATE") {
      if (m.state === "needs_permission") {                         // permission was taken away: ask again
        await chrome.storage.local.set({ micGranted: false });
        try { await chrome.offscreen.closeDocument(); } catch (e) {}
        await openSetupTab(false);
      } else if (m.state === "speech_unreachable" || m.state === "no_microphone") {
        const tab = await voiceTarget();
        const txt = m.state === "no_microphone" ? "I can't find a microphone. Check that one is plugged in, then press Microphone check in Settings." : "Chrome's speech service isn't reachable right now (internet, a VPN or firewall, or speech recognition is blocked). Hands-free needs it. Settings > Microphone check > Test speech tells us more. Code: " + (m.code || "unknown");
        if (tab) sendToTab(tab, { type: "NAVI_VOICE_GOAL", kind: "note", text: txt });
      } else if (m.state === "unsupported") {
        const tab = await voiceTarget();
        if (tab) sendToTab(tab, { type: "NAVI_VOICE_GOAL", kind: "note", text: "Voice needs Chrome or Edge (the browser's speech recognition)." });
      }
    }
  })();
});

chrome.storage.onChanged.addListener(async (c, area) => {
  if (area !== "local") return;
  if (c.micGranted?.newValue) startEars(false);
  if (c.voiceWake || c.voiceName || c.voiceLang) startEars(true);   // restart the ears so the new name / language applies
});

chrome.runtime.onStartup.addListener(() => startEars(false));
