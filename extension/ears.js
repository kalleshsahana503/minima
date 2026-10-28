// Minima · ears. An invisible helper page (a Chrome "offscreen document"): it keeps the microphone open, waits for
// "Hey Minima ..." and sends what you said to the page you are on. No tab, no window.
// Chrome's built-in speech recognition does the listening: your voice is processed by Google's speech service.
(() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const q = new URLSearchParams(location.search);
  const cfg = { wake: q.get("wake") !== "0", name: (q.get("name") || "Minima").trim() || "Minima", lang: q.get("lang") || "en-IN" };
  let reportedNet = false, rec = null, running = false, muted = false, wantOnce = false, awaitingUntil = 0, onceTimer = null;

  const emit = (msg) => { try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch (e) {} };
  const report = (state, code) => emit({ type: "NAVI_VOICE_STATE", state, code });

  function beep() {
    try {
      const ac = new AudioContext(), o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 880; g.gain.value = 0.06;
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.12);
      setTimeout(() => ac.close(), 400);
    } catch (e) {}
  }

  const shouldListen = () => !muted && (cfg.wake || wantOnce || Date.now() < awaitingUntil);

  function refresh() {
    const on = shouldListen();
    if (on && !running) start();
    if (!on && running) stop();
  }

  function start() {
    if (!SR) { report("unsupported"); return; }
    try {
      rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;      // react to "Hey Minima" while you are still speaking
      rec.maxAlternatives = 4;        // look at several guesses of what you said
      rec.lang = cfg.lang;
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const alts = [...e.results[i]].map((a) => a.transcript);
          if (e.results[i].isFinal) { woke = false; heard(alts); } else early(alts);
        }
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed") { running = false; report("needs_permission"); }
        else if (e.error === "service-not-allowed" || e.error === "network") { if (!reportedNet) { reportedNet = true; report("speech_unreachable", e.error); } }
        else if (e.error === "audio-capture") { report("no_microphone"); }
      };
      rec.onend = () => { running = false; if (shouldListen()) setTimeout(refresh, 120); };
      rec.start();
      running = true;
    } catch (e) { running = false; }
  }

  function stop() {
    running = false;
    try { rec && rec.abort(); } catch (e) {}
  }

  // While you are still talking: the moment the name is recognised, show it (a soft beep + the panel), without speaking over you.
  let woke = false;
  function early(alts) {
    if (woke || !cfg.wake || wantOnce || Date.now() < awaitingUntil) return;
    if (NAVI.parseAlts(alts, cfg.name).wake) { woke = true; beep(); emit({ type: "NAVI_VOICE", kind: "wake_quiet" }); }
  }

  function heard(alts) {
    const text = String(alts[0] || "").trim();
    if (!text) return;
    const p = NAVI.parseAlts(alts, cfg.name);
    if (Date.now() < awaitingUntil || wantOnce) {            // we were waiting for a command (after the name, or the mic button)
      if (p.wake && !p.command) return;                      // only the name again: keep waiting
      awaitingUntil = 0; wantOnce = false; clearTimeout(onceTimer);
      emit({ type: "NAVI_VOICE", kind: "command", text: p.wake ? p.command || text : text });
    } else if (cfg.wake && p.wake) {
      if (p.command) emit({ type: "NAVI_VOICE", kind: "command", text: p.command });
      else { awaitingUntil = Date.now() + 8000; beep(); emit({ type: "NAVI_VOICE", kind: "wake" }); setTimeout(refresh, 8200); }
    }
    refresh();
  }

  chrome.runtime.onMessage.addListener((m) => {
    if (!m || m.type !== "NAVI_VOICE_CTL") return;
    if (m.mute === true) { muted = true; stop(); }
    if (m.mute === false) muted = false;
    if (m.cancelOnce) { wantOnce = false; clearTimeout(onceTimer); }
    if (m.listenOnce) {
      wantOnce = true; beep();
      clearTimeout(onceTimer); onceTimer = setTimeout(() => { wantOnce = false; refresh(); }, 12000);
    }
    refresh();
  });

  refresh();
  setInterval(() => { if (shouldListen() && !running) start(); }, 2500);   // safety net: if Chrome stops listening for any reason, start again
})();
