// Minima · microphone setup and test page. Opens only (1) the first time, to ask for the microphone once, and
// (2) when you press "Microphone check" in Settings. The listening itself happens in ears.js, invisibly.
(() => {
  const $ = (id) => document.getElementById(id);
  const testMode = new URLSearchParams(location.search).get("test") === "1";
  let meter = null;

  async function startMeter() {
    if (meter) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ac = new AudioContext(), src = ac.createMediaStreamSource(stream), an = ac.createAnalyser();
    an.fftSize = 512; src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    const label = stream.getAudioTracks()[0]?.label || "default microphone";
    $("mic").textContent = "Microphone: " + label;
    meter = { stream, ac };
    let quietSince = Date.now();
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const b of buf) peak = Math.max(peak, Math.abs(b - 128));
      const lvl = Math.min(1, peak / 60);
      $("lvl").style.width = Math.round(lvl * 100) + "%";
      if (lvl > 0.06) quietSince = Date.now();
      else if (Date.now() - quietSince > 15000) $("mic").textContent = "I hear no sound from “" + label + "”. Choose the right microphone: Windows Settings > System > Sound > Input.";
      requestAnimationFrame(tick);
    };
    tick();
  }

  // Speech test: does Chrome's speech recognition work (and does it hear you) in a normal page?
  function speechTest() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { $("heard").textContent = "This browser has no speech recognition. Use Chrome or Edge."; return; }
    const rec = new SR();
    rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = false;
    $("heard").textContent = "Listening… speak now";
    let got = "";
    rec.onresult = (e) => { got = [...e.results].map((r) => r[0].transcript).join(" "); $("heard").textContent = "Heard: " + got; };
    rec.onerror = (e) => { $("heard").textContent = "Speech error code: " + e.error + (e.error === "network" ? "  (Chrome could not reach Google's speech service: check internet, VPN or firewall)" : e.error === "no-speech" ? "  (it heard silence: check the green bar above)" : e.error === "not-allowed" ? "  (microphone blocked)" : ""); };
    rec.onend = () => { if (!got && !$("heard").textContent.startsWith("Speech error")) $("heard").textContent = "Nothing heard. Try again."; };
    try { rec.start(); } catch (e) { $("heard").textContent = "Could not start: " + e; }
  }
  $("stt").addEventListener("click", speechTest);

  async function granted() {
    if (testMode) $("stt").classList.remove("hidden");
    $("allow").classList.add("hidden");
    $("state").textContent = testMode ? "Microphone works. Speak: the bar should move." : "Microphone allowed. Closing…";
    try { await startMeter(); } catch (e) {}
    try { await chrome.runtime.sendMessage({ type: "NAVI_VOICE", kind: "granted", test: testMode }); } catch (e) {}
  }

  $("allow").addEventListener("click", async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      await granted();
    } catch (e) { $("state").textContent = "Still blocked. Click the lock icon in the address bar and allow the microphone."; }
  });

  (async () => {
    try {
      const perm = await navigator.permissions.query({ name: "microphone" });
      if (perm.state === "granted") return granted();
      $("allow").classList.remove("hidden");
      $("state").textContent = perm.state === "denied" ? "The microphone is blocked for Minima. Click the lock icon in the address bar and allow it." : "Click the button to allow the microphone (once).";
    } catch (e) { $("allow").classList.remove("hidden"); $("state").textContent = "Click the button to allow the microphone (once)."; }
  })();
})();
