// Minima – the floating logo and the in-page assistant panel.
// Lives in a Shadow DOM so the website's CSS can't touch it (and ours can't touch the website).
(() => {
  if (window.__naviOverlay) return;
  if (window.top !== window) return; // top frame only
  if (!chrome.runtime?.id || NAVI.isRestricted(location.href)) return;
  window.__naviOverlay = true;

  const DEFAULT_SERVER = "ws://127.0.0.1:8000/ws";
  const FAB = 64;
  const store = {
    get: (k) => chrome.storage.local.get(k),
    set: (o) => chrome.storage.local.set(o),
  };

  /* ------------------------------------------------------------------ logo (SVG) */
  function logoSVG(p) {
    const R = 70;
    const pts = [-90, -30, 30, 90, 150, 210].map((a) => [+(R * Math.cos((a * Math.PI) / 180)).toFixed(2), +(R * Math.sin((a * Math.PI) / 180)).toFixed(2)]);
    const hex = pts.map((q) => q.join(",")).join(" ");
    const links = pts.map(([x, y]) => `<line class="lk" x1="0" y1="0" x2="${x}" y2="${y}" stroke="url(#${p}G)" stroke-width="2"/>`).join("");
    const nodes = pts
      .map(
        ([x, y], i) =>
          `<g class="nd" style="--i:${i}"><circle cx="${x}" cy="${y}" r="9" fill="#0B1020" stroke="url(#${p}G)" stroke-width="3"/><circle cx="${x}" cy="${y}" r="3.2" fill="${i % 2 ? "#38BDF8" : "#2DE2B0"}"/></g>`
      )
      .join("");
    return `<svg viewBox="-110 -110 220 220" role="img" aria-label="Minima">
      <defs>
        <linearGradient id="${p}G" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2DE2B0"/><stop offset=".55" stop-color="#38BDF8"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient>
        <radialGradient id="${p}I" cx=".5" cy=".42" r=".65"><stop offset="0" stop-color="#FFF3C4"/><stop offset=".45" stop-color="#FBBF24"/><stop offset="1" stop-color="#FB7185"/></radialGradient>
        <radialGradient id="${p}H" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#38BDF8" stop-opacity=".38"/><stop offset="1" stop-color="#38BDF8" stop-opacity="0"/></radialGradient>
      </defs>
      <g class="lg">
        <circle class="halo" r="98" fill="url(#${p}H)"/>
        <circle class="r1" r="92" fill="none" stroke="url(#${p}G)" stroke-width="1.6" stroke-dasharray="2 10" opacity=".7"/>
        <g class="orbit"><polygon points="${hex}" fill="rgba(56,189,248,.1)" stroke="url(#${p}G)" stroke-width="5" stroke-linejoin="round"/>${links}${nodes}</g>
        <circle class="spin" r="38" fill="none" stroke="url(#${p}G)" stroke-width="4" stroke-linecap="round" stroke-dasharray="60 140"/>
        <circle class="okr" r="60" fill="none" stroke="#34D399" stroke-width="4"/>
        <g class="irisg"><g class="eye"><circle class="iris" r="27" fill="url(#${p}I)"/><g class="pupil"><circle r="11" fill="#0B1020"/><circle cx="-3.5" cy="-4" r="3.3" fill="#fff" opacity=".92"/></g></g></g>
      </g></svg>`;
  }

  const ICON = {
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
    sliders: '<svg viewBox="0 0 24 24"><path d="M4 7h9M19 7h1M4 17h1M11 17h9" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="16" cy="7" r="2.5" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="8" cy="17" r="2.5" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12.6 2-12.6 2z" fill="currentColor"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><path d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 0 0-7 0v5a3.5 3.5 0 0 0 3.5 3.5zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3zm-1 14-3-3 1.4-1.4L11 13.2l4.6-4.6L17 10l-6 6z" fill="currentColor"/></svg>',
  };

  /* ------------------------------------------------------------------ styles */
  const CSS = `
  :host{all:initial}
  *{box-sizing:border-box;font-family:Inter,"Segoe UI",system-ui,-apple-system,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
  button{font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0}
  .hidden{display:none!important}
  svg{display:block}

  /* ---- floating logo ---- */
  .fab{position:fixed;left:0;top:0;width:${FAB}px;height:${FAB}px;pointer-events:auto;cursor:grab;touch-action:none;user-select:none;
    transition:transform .3s cubic-bezier(.22,1,.36,1),left .35s cubic-bezier(.22,1,.36,1),top .35s cubic-bezier(.22,1,.36,1);perspective:500px;
    filter:drop-shadow(0 8px 22px rgba(56,189,248,.45));animation:pop .7s cubic-bezier(.22,1.4,.36,1) both}
  .fab:hover{transform:scale(1.1)}
  .fab.drag{cursor:grabbing;transition:none;transform:scale(1.14)}
  .fab .tilt{width:100%;height:100%;transition:transform .25s cubic-bezier(.2,.8,.2,1);transform-style:preserve-3d}
  .fab svg{width:100%;height:100%;overflow:visible}
  @keyframes pop{from{opacity:0;transform:scale(.2) rotate(-40deg)}to{opacity:1;transform:none}}
  .tip{position:absolute;left:50%;bottom:calc(100% + 10px);transform:translate(-50%,6px) scale(.92);padding:6px 12px;border-radius:12px;white-space:nowrap;
    font:600 12px/1.2 Inter,system-ui,sans-serif;color:#EAF2FF;background:rgba(14,20,42,.96);border:1px solid rgba(56,189,248,.45);
    box-shadow:0 8px 24px rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .25s,transform .25s}
  .tip.below{bottom:auto;top:calc(100% + 10px)}
  .tip.to-left{left:auto;right:0;transform:translate(0,6px) scale(.92);transform-origin:100% 100%}
  .tip.show,.fab:hover .tip{opacity:1;transform:translate(-50%,0) scale(1)}
  .tip.to-left.show,.fab:hover .tip.to-left{transform:translate(0,0) scale(1)}
  .fab.dragging .tip{opacity:0}

  .lg *{transform-box:fill-box;transform-origin:center}
  .lg .orbit,.lg .spin,.lg .okr,.lg .r1{transform-box:view-box;transform-origin:0 0}
  .halo{animation:breath 4.2s ease-in-out infinite}
  .r1{animation:rot 38s linear infinite reverse}
  .orbit{animation:rot 32s linear infinite}
  .lk{opacity:.5;animation:link 3.2s ease-in-out infinite}
  .nd{animation:node 3.2s ease-in-out infinite;animation-delay:calc(var(--i)*-.53s)}
  .iris{filter:drop-shadow(0 0 8px rgba(251,191,36,.7));animation:pulse 3s ease-in-out infinite}
  .eye{animation:blink 5.5s infinite}
  .spin{opacity:0}
  .okr{opacity:0}
  .fab:hover .orbit,.big:hover .orbit{animation-duration:9s}
  .fab:hover .nd{animation-duration:1.4s}
  [data-state=thinking] .orbit{animation-duration:3s}
  [data-state=thinking] .spin{opacity:1;animation:rot .9s linear infinite}
  [data-state=thinking] .iris{animation:pulse .7s ease-in-out infinite;filter:drop-shadow(0 0 12px rgba(251,113,133,.95))}
  [data-state=thinking] .nd{animation-duration:.9s}
  [data-state=waiting] .iris{animation:pulse 1s ease-in-out infinite;filter:drop-shadow(0 0 14px rgba(251,191,36,1))}
  [data-state=done] .okr{animation:ripple 1s ease-out}
  [data-state=done] .iris{filter:drop-shadow(0 0 14px rgba(52,211,153,.95))}
  .fab[data-state=waiting]::after{content:"";position:absolute;right:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#FBBF24;border:2px solid #0B1020;animation:ping 1.2s infinite}
  @keyframes rot{to{transform:rotate(360deg)}}
  @keyframes breath{0%,100%{transform:scale(1);opacity:.8}50%{transform:scale(1.1);opacity:1}}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
  @keyframes node{0%,100%{transform:scale(1)}50%{transform:scale(1.22)}}
  @keyframes link{0%,100%{opacity:.3}50%{opacity:.8}}
  @keyframes blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.08)}}
  @keyframes ripple{0%{transform:scale(.4);opacity:.95}100%{transform:scale(1.55);opacity:0}}
  @keyframes ping{0%{box-shadow:0 0 0 0 rgba(251,191,36,.8)}100%{box-shadow:0 0 0 10px rgba(251,191,36,0)}}

  /* ---- panel ---- */
  .panel{position:fixed;left:0;top:0;width:392px;height:640px;max-height:calc(100vh - 24px);pointer-events:auto;display:flex;flex-direction:column;overflow:hidden;overflow:clip;
    border-radius:22px;background:rgba(8,12,26,.95);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.12);color:#E8ECFF;font-size:14px;line-height:1.5;
    box-shadow:0 28px 90px rgba(0,0,0,.6),0 0 0 1px rgba(56,189,248,.08);
    opacity:0;visibility:hidden;transform:scale(.8) translateY(12px);transform-origin:var(--ox,100%) var(--oy,100%);
    transition:opacity .25s,transform .4s cubic-bezier(.22,1,.36,1),visibility 0s .4s}
  .panel.open{opacity:1;visibility:visible;transform:none;transition-delay:0s}
  .panel.instant{transition:none}
  .bgwrap{position:absolute;inset:0;overflow:hidden;z-index:0;pointer-events:none;border-radius:inherit}
  .bg{position:absolute;inset:0;width:100%;height:100%}
  .blob{position:absolute;border-radius:50%;filter:blur(60px);opacity:.28;z-index:0;pointer-events:none}
  .b1{width:240px;height:240px;left:-80px;top:-70px;background:#2DE2B0;animation:drift 18s ease-in-out infinite}
  .b2{width:260px;height:260px;right:-90px;bottom:-90px;background:#8B5CF6;animation:drift 22s ease-in-out -8s infinite}
  @keyframes drift{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(40px,30px) scale(1.2)}}
  header,.feed,.composer,.settings{position:relative;z-index:1}
  header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.09);background:rgba(8,12,26,.55);backdrop-filter:blur(10px)}
  .brand{display:flex;align-items:center;gap:10px;min-width:0}
  .mini{width:34px;height:34px;flex:none}
  .mini svg{width:100%;height:100%;overflow:visible}
  .brand b{display:block;font-size:15px;font-weight:800;letter-spacing:.02em;background:linear-gradient(120deg,#2DE2B0,#38BDF8,#8B5CF6);-webkit-background-clip:text;background-clip:text;color:transparent}
  .brand span{display:block;font-size:11.5px;color:#97A0C6;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .head-actions{display:flex;align-items:center;gap:4px}
  .ib{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;color:#97A0C6;transition:background .2s,color .2s}
  .ib:hover{background:rgba(255,255,255,.09);color:#fff}
  .ib svg{width:17px;height:17px}
  .pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);margin-right:4px}
  .pill i{width:7px;height:7px;border-radius:50%;background:#97A0C6}
  .pill.working i{background:#38BDF8;animation:dot 1.1s infinite}
  .pill.waiting i{background:#FBBF24;animation:dot 1.3s infinite}
  .pill.done i{background:#34D399}
  .pill.error i{background:#FB7185}
  @keyframes dot{0%{box-shadow:0 0 0 0 rgba(56,189,248,.7)}100%{box-shadow:0 0 0 8px rgba(56,189,248,0)}}

  .feed{flex:1;overflow-y:auto;padding:16px 14px 6px;scroll-behavior:smooth}
  .feed::-webkit-scrollbar{width:6px}.feed::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:6px}
  .welcome{text-align:center;padding:10px 4px 6px;animation:rise .6s cubic-bezier(.22,1,.36,1) both}
  .big{width:96px;height:96px;margin:0 auto 14px;position:relative}
  .big svg{width:100%;height:100%;overflow:visible;filter:drop-shadow(0 10px 30px rgba(56,189,248,.45))}
  .big::before,.big::after{content:"";position:absolute;inset:-8px;border-radius:50%;border:1px solid rgba(56,189,248,.45);animation:wave 3.2s ease-out infinite}
  .big::after{animation-delay:1.6s}
  @keyframes wave{0%{transform:scale(.85);opacity:.9}100%{transform:scale(1.4);opacity:0}}
  .welcome h2{margin:0 0 6px;font-size:19px;font-weight:800;background:linear-gradient(120deg,#2DE2B0,#38BDF8,#8B5CF6);-webkit-background-clip:text;background-clip:text;color:transparent}
  .welcome p{margin:0 auto 14px;color:#97A0C6;font-size:12.5px;max-width:290px}
  .chips{display:grid;gap:7px;text-align:left}
  .chip{padding:10px 13px;border-radius:13px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);font-size:13px;text-align:left;transition:transform .25s,border-color .25s,background .25s;animation:rise .5s cubic-bezier(.22,1,.36,1) both}
  .chip:hover{transform:translateY(-2px);border-color:rgba(56,189,248,.7);background:rgba(255,255,255,.08)}
  .chip:nth-child(2){animation-delay:.06s}.chip:nth-child(3){animation-delay:.12s}.chip:nth-child(4){animation-delay:.18s}.chip:nth-child(5){animation-delay:.24s}.chip:nth-child(6){animation-delay:.3s}
  .trust{margin-top:12px;width:100%;padding:10px 12px;border-radius:13px;border:1px dashed rgba(45,226,176,.5);color:#2DE2B0;font-size:12.5px;font-weight:600;transition:background .2s}
  .trust:hover{background:rgba(45,226,176,.08)}
  .trust.on{border-style:solid;background:rgba(45,226,176,.1)}
  @keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}

  .msg{display:flex;margin-bottom:12px;animation:rise .4s cubic-bezier(.22,1,.36,1) both}
  .msg.user{justify-content:flex-end}
  .bubble{max-width:90%;padding:9px 13px;border-radius:16px;word-wrap:break-word;overflow-wrap:anywhere}
  .msg.user .bubble{background:linear-gradient(135deg,#38BDF8,#8B5CF6);color:#fff;border-bottom-right-radius:5px;box-shadow:0 8px 22px rgba(56,189,248,.25);white-space:pre-wrap}
  .msg.agent .bubble{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-bottom-left-radius:5px}
  .msg.err .bubble{border-color:rgba(251,113,133,.5);color:#fecdd3}
  .bubble p{margin:0 0 6px}.bubble p:last-child{margin:0}
  .bubble ul,.bubble ol{margin:4px 0 6px;padding-left:20px}
  .bubble a{color:#7dd3fc}
  .bubble code{background:rgba(255,255,255,.1);padding:1px 5px;border-radius:5px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
  .note{text-align:center;font-size:11.5px;color:#97A0C6;margin:4px 0 12px}

  .steps{margin:0 0 12px 6px;padding-left:14px;border-left:2px solid rgba(255,255,255,.1)}
  .step{position:relative;padding:2px 0 7px 12px;font-size:12.5px;color:#97A0C6;animation:rise .35s both}
  .step::before{content:"";position:absolute;left:-21px;top:8px;width:9px;height:9px;border-radius:50%;background:#0B1020;border:2px solid #38BDF8}
  .step.run::before{animation:dot 1.1s infinite}
  .step.ok::before{background:#34D399;border-color:#34D399}
  .step.fail::before{background:#FB7185;border-color:#FB7185}
  .step b{color:#E8ECFF;font-weight:600}
  .step.thought{font-style:italic}
  .typing{display:inline-flex;gap:4px;padding:11px 14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:16px;border-bottom-left-radius:5px}
  .typing span{width:6px;height:6px;border-radius:50%;background:#38BDF8;animation:bounce 1.2s infinite}
  .typing span:nth-child(2){animation-delay:.15s}.typing span:nth-child(3){animation-delay:.3s}
  @keyframes bounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}

  .card{margin-bottom:12px;padding:13px;border-radius:15px;border:1px solid rgba(251,191,36,.4);background:linear-gradient(180deg,rgba(251,191,36,.1),rgba(251,191,36,.02));animation:rise .4s both}
  .card.ask{border-color:rgba(56,189,248,.45);background:linear-gradient(180deg,rgba(56,189,248,.1),rgba(56,189,248,.02))}
  .card h4{margin:0 0 5px;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#FBBF24}
  .card.ask h4{color:#38BDF8}
  .card p{margin:0 0 11px}
  .row{display:flex;gap:8px}
  .card input{width:100%;padding:9px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.35);color:#fff;margin-bottom:9px;outline:none;font:inherit}
  .card input:focus{border-color:#38BDF8}
  .card.done{opacity:.55;pointer-events:none}
  .card .res{margin:8px 0 0;font-size:12px;color:#97A0C6}

  .btn{padding:8px 13px;border-radius:11px;font-weight:700;font-size:13px;transition:transform .2s,filter .2s}
  .btn:hover{transform:translateY(-1px);filter:brightness(1.1)}
  .btn.p{background:linear-gradient(120deg,#2DE2B0,#38BDF8 55%,#8B5CF6);color:#04101c;box-shadow:0 8px 22px rgba(56,189,248,.3)}
  .btn.g{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14)}
  .btn.d{background:rgba(251,113,133,.14);border:1px solid rgba(251,113,133,.4);color:#fecdd3}

  .composer{padding:9px 12px 11px;border-top:1px solid rgba(255,255,255,.09);background:rgba(8,12,26,.6);backdrop-filter:blur(10px)}
  .box{display:flex;align-items:flex-end;gap:7px;padding:5px 5px 5px 13px;border-radius:17px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);transition:border-color .25s,box-shadow .25s}
  .box:focus-within{border-color:#38BDF8;box-shadow:0 0 0 4px rgba(56,189,248,.16)}
  .box textarea{flex:1;background:none;border:0;outline:none;color:#fff;font:inherit;resize:none;padding:8px 0;max-height:110px;min-height:22px;line-height:1.4}
  .box textarea::placeholder{color:#7b84ab}
  .send{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(120deg,#2DE2B0,#38BDF8 55%,#8B5CF6);color:#04101c;transition:transform .2s;box-shadow:0 6px 18px rgba(56,189,248,.4)}
  .send:hover{transform:scale(1.07)}
  .send.stop{background:#FB7185;color:#fff}
  .send.mic{background:rgba(255,255,255,.08);color:#9fe9d6;box-shadow:none;border:1px solid rgba(255,255,255,.14)}
  .send.mic.on{background:#2DE2B0;color:#04101c;animation:pulse 1s ease-in-out infinite}
  .send svg{width:17px;height:17px}
  .hint{margin:6px 0 0;text-align:center;font-size:10.5px;color:#6f789f}

  .settings{position:absolute;inset:57px 0 0 0;overflow-y:auto;padding:14px;background:#0a0f22;z-index:5;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.22) transparent}
  .settings::-webkit-scrollbar{width:6px}.settings::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:6px}
  .settings h3{margin:0 0 10px;font-size:15px}
  .settings label{display:block;font-size:12px;font-weight:700;margin-bottom:12px}
  .settings label small{display:block;font-weight:400;color:#97A0C6;margin-top:1px}
  .settings input[type=text],.settings textarea{display:block;width:100%;margin-top:5px;padding:9px 11px;border-radius:11px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.35);color:#fff;font:inherit;font-size:13px;outline:none;resize:vertical}
  .settings select{display:block;width:100%;margin-top:5px;padding:9px 11px;border-radius:11px;border:1px solid rgba(255,255,255,.14);background:#0e1530;color:#EAF0FF;font-size:13px}
  .settings input:focus,.settings textarea:focus,.settings select:focus{border-color:#38BDF8}
  .check{display:flex!important;gap:10px;align-items:flex-start;font-weight:600!important}
  .check input{margin-top:3px;accent-color:#2DE2B0}
  .check small{display:block}
  .locked{margin:0 0 12px;padding:9px 11px;border-radius:11px;background:rgba(251,113,133,.08);border:1px solid rgba(251,113,133,.3);font-size:12px;color:#fecdd3}

  .sheet{position:absolute;inset:0;z-index:8;display:flex;align-items:flex-end;background:rgba(3,5,12,.65);backdrop-filter:blur(5px);animation:fade .25s both}
  @keyframes fade{from{opacity:0}to{opacity:1}}
  .sheet-card{width:100%;padding:22px 18px 16px;border-radius:22px 22px 0 0;background:#10152c;border-top:1px solid rgba(255,255,255,.12);text-align:center;animation:slide .4s cubic-bezier(.22,1,.36,1) both}
  @keyframes slide{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
  .shield{width:52px;height:52px;margin:0 auto 10px;border-radius:17px;display:grid;place-items:center;background:linear-gradient(135deg,#2DE2B0,#38BDF8,#8B5CF6);color:#04101c;box-shadow:0 10px 28px rgba(56,189,248,.4)}
  .shield svg{width:26px;height:26px}
  .sheet-card h3{margin:0 0 6px;font-size:16px}
  .sheet-card h3 span{background:linear-gradient(120deg,#2DE2B0,#38BDF8);-webkit-background-clip:text;background-clip:text;color:transparent}
  .sheet-card p{margin:0 0 14px;color:#97A0C6;font-size:12.5px}
  .sheet-card .row .btn{flex:1}
  .linkbtn{margin-top:10px;color:#97A0C6;font-size:12px;text-decoration:underline}
  .linkbtn.mint{color:#2DE2B0}

  @media (max-width:480px){.panel{width:calc(100vw - 16px)!important;left:8px!important}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  `;

  /* ------------------------------------------------------------------ DOM */
  // After the extension is reloaded/updated, the old copy of this script stays on pages that were already open,
  // and the new copy would add a SECOND logo. Remove any leftover logo first so there is always exactly one.
  document.querySelectorAll("#navi-everywhere-root").forEach((old) => old.remove());
  const host = document.createElement("div");
  host.id = "navi-everywhere-root";
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${CSS}</style>
    <div class="fab" data-state="idle" title="">
      <div class="tilt">${logoSVG("f")}</div><div class="tip">Ask Minima</div>
    </div>
    <div class="panel" role="dialog" aria-label="Minima assistant">
      <div class="bgwrap"><canvas class="bg"></canvas><div class="blob b1"></div><div class="blob b2"></div></div>
      <header>
        <div class="brand"><div class="mini" data-state="idle">${logoSVG("m")}</div><div><b>Minima</b><span class="site"></span></div></div>
        <div class="head-actions">
          <span class="pill idle"><i></i><b>Ready</b></span>
          <button class="ib" data-act="new" title="New chat">${ICON.plus}</button>
          <button class="ib" data-act="settings" title="Settings">${ICON.sliders}</button>
          <button class="ib" data-act="close" title="Close (Esc)">${ICON.close}</button>
        </div>
      </header>
      <main class="feed"></main>
      <section class="settings hidden">
        <h3>Settings</h3>
        <div class="locked">Always blocked: Facebook and Messenger.</div>
        <label class="check"><input type="checkbox" id="trustAll"/><span>Allow Minima on every site (except blocked ones)<small>Off = Minima asks the first time on each site.</small></span></label>
        <label class="check"><input type="checkbox" id="askFirst"/><span>Ask me before sending, submitting or applying<small>Off (default) = Minima just does it. Payments and deletions always ask, whatever this says.</small></span></label>
        <label class="check"><input type="checkbox" id="rememberPages"/><span>Remember pages Minima reads, so I can search them later<small>Stored only on this computer.</small></span></label>
        <label>My details<small>Used only to fill forms you ask for. Never put passwords, OTPs or card numbers here.</small>
          <textarea id="profile" rows="5" placeholder="Name: …&#10;Email: …&#10;Phone: …&#10;Address: …"></textarea></label>
        <label>Extra blocked sites<small>One per line, e.g. mybank.com</small>
          <textarea id="extraBlocked" rows="3" placeholder="example.com"></textarea></label>
        <h3 style="margin-top:6px">Messages and email</h3>
        <label class="check"><input type="checkbox" id="allowWhatsapp"/><span>Let Minima work on WhatsApp Web<small>On by default. When on, Minima can read your chats and draft replies, but it always asks you before it sends anything. What it reads goes to Groq to produce the answer. Refresh the WhatsApp tab after changing this. Facebook and Messenger stay blocked.</small></span></label>
        <h3 style="margin-top:6px">Voice</h3>
        <label class="check"><input type="checkbox" id="voiceWake"/><span>Always listen for her name (hands-free)<small>Say “Hey Minima, …” any time. Works quietly in the background, no extra tab. Chrome sends what it hears to Google's speech service to turn it into text. Off = use only the mic button.</small></span></label>
        <label>Her voice<small>One voice, always the same.</small><select id="ttsVoice"><option value="">Automatic</option></select></label>
        <div class="row"><button class="btn g" data-act="miccheck">Microphone check</button></div>
        <label>Her name<small>The word that wakes her up</small><input type="text" id="voiceName" spellcheck="false" placeholder="Minima"/></label>
        <label>Language you speak<select id="voiceLang">
          <option value="en-IN">English (India)</option><option value="en-US">English (US)</option><option value="en-GB">English (UK)</option>
          <option value="hi-IN">Hindi</option><option value="te-IN">Telugu</option><option value="ta-IN">Tamil</option><option value="kn-IN">Kannada</option>
          <option value="ml-IN">Malayalam</option><option value="mr-IN">Marathi</option><option value="bn-IN">Bengali</option></select></label>
        <label class="check"><input type="checkbox" id="speakAnswers"/><span>Speak answers out loud<small>Minima tells you out loud when a task is finished.</small></span></label>
        <label class="check"><input type="checkbox" id="speakTyped"/><span>Also speak for tasks I typed<small>Off = only tasks you gave by voice are spoken.</small></span></label>
        <label>Agent address<input type="text" id="serverUrl" spellcheck="false" placeholder="${DEFAULT_SERVER}"/></label>
        <label>Access token <small>Only if you set NAVI_TOKEN in backend/.env</small><input type="text" id="token" spellcheck="false"/></label>
        <div class="row"><button class="btn g" data-act="forget">Forget site permissions</button><button class="btn p" data-act="save">Save</button></div>
      </section>
      <footer class="composer">
        <div class="box"><textarea rows="1" placeholder="Ask about this page, or tell me what to do…"></textarea>
          <button class="send mic" data-act="mic" title="Click and speak. Your words are sent as a task when you stop talking.">${ICON.mic}</button>
          <button class="send" data-act="send" title="Send">${ICON.send}</button>
          <button class="send stop hidden" data-act="stop" title="Stop">${ICON.stop}</button></div>
        <p class="hint">Minima can make mistakes. Check important details before you submit.</p>
      </footer>
    </div>`;
  document.documentElement.appendChild(host);

  const $ = (sel) => root.querySelector(sel);
  const fab = $(".fab"), panel = $(".panel"), feed = $(".feed"), input = $(".box textarea");
  const micBtn = $('[data-act="mic"]');
  const sendBtn = $('[data-act="send"]'), stopBtn = $('[data-act="stop"]');
  const settingsEl = $(".settings"), pill = $(".pill"), tip = $(".tip"), mini = $(".mini");
  $(".site").textContent = location.hostname;

  /* ------------------------------------------------------------------ position of the logo & panel */
  let fx = 0, fy = 0, isOpen = false;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function placeFab(x, y, animate) {
    fx = clamp(x, 6, innerWidth - FAB - 6);
    fy = clamp(y, 6, innerHeight - FAB - 6);
    if (!animate) fab.style.transition = "transform .3s";
    fab.style.left = fx + "px";
    fab.style.top = fy + "px";
    if (!animate) requestAnimationFrame(() => (fab.style.transition = ""));
    tip.classList.toggle("below", fy < 70);
    tip.classList.toggle("to-left", fx + FAB / 2 > innerWidth / 2); // label grows leftwards near the right edge so it never leaves the screen
    if (isOpen) placePanel();
  }

  function placePanel() {
    const w = Math.min(392, innerWidth - 16);
    const h = Math.min(640, innerHeight - 24);
    const fitsAbove = fy - h - 14 >= 12;
    const fitsBelow = fy + FAB + 14 + h <= innerHeight - 12;
    let x, y;
    if (fitsAbove || fitsBelow) {
      // above the logo when it sits in the lower half (or when below doesn't fit), otherwise below it
      const above = fitsAbove && (fy + FAB / 2 > innerHeight / 2 || !fitsBelow);
      x = clamp(fx + FAB - w, 8, innerWidth - w - 8);
      y = above ? fy - h - 14 : fy + FAB + 14;
    } else {
      // no room above or below: open beside the logo, never on top of it
      x = fx + FAB / 2 > innerWidth / 2 ? fx - w - 14 : fx + FAB + 14;
      x = clamp(x, 8, innerWidth - w - 8);
      y = fy + FAB / 2 - h / 2;
    }
    y = clamp(y, 12, innerHeight - h - 12);
    panel.style.width = w + "px";
    panel.style.height = h + "px";
    panel.style.left = x + "px";
    panel.style.top = y + "px";
    panel.style.setProperty("--ox", clamp(fx + FAB / 2 - x, 0, w) + "px");
    panel.style.setProperty("--oy", clamp(fy + FAB / 2 - y, 0, h) + "px");
  }

  async function initPosition() {
    const { fabPos } = await store.get("fabPos");
    if (fabPos) placeFab(fabPos.rx * (innerWidth - FAB), fabPos.ry * (innerHeight - FAB), true);
    else placeFab(innerWidth - FAB - 22, innerHeight - FAB - 26, true);
  }

  function savePosition() {
    store.set({ fabPos: { rx: fx / Math.max(1, innerWidth - FAB), ry: fy / Math.max(1, innerHeight - FAB) } }).catch(() => {});
  }

  /* drag the logo anywhere; a plain click opens the panel */
  let drag = null;
  fab.addEventListener("pointerdown", (e) => {
    fab.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, l: fx, t: fy, moved: false };
  });
  fab.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 5) {
      drag.moved = true;
      fab.classList.add("drag", "dragging");
    }
    if (drag.moved) placeFab(drag.l + dx, drag.t + dy, true);
  });
  const endDrag = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    fab.classList.remove("drag", "dragging");
    if (!d.moved) return toggle();
    placeFab(fx + FAB / 2 < innerWidth / 2 ? 14 : innerWidth - FAB - 14, fy, true); // snap to the nearest side
    savePosition();
  };
  fab.addEventListener("pointerup", endDrag);
  fab.addEventListener("pointercancel", endDrag);
  addEventListener("resize", () => placeFab(fx, fy, true));

  /* the eye follows your cursor, the logo tilts toward it */
  let lastMove = null, raf = 0;
  const eyes = () => [...root.querySelectorAll(".pupil")].map((p) => [p, p.closest("svg"), p.closest(".irisg")]);
  function onMove(e) {
    lastMove = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const tilt = fab.querySelector(".tilt");
      for (const [pupil, svg, iris] of eyes()) {
        const r = svg.getBoundingClientRect();
        if (!r.width) continue;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = lastMove.clientX - cx, dy = lastMove.clientY - cy, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 240);
        pupil.style.transform = `translate(${(dx / d) * 10 * k}px,${(dy / d) * 10 * k}px)`;
        iris.style.transform = `translate(${(dx / d) * 3 * k}px,${(dy / d) * 3 * k}px)`;
      }
      const r = fab.getBoundingClientRect();
      const tx = clamp((lastMove.clientX - (r.left + r.width / 2)) / 420, -1, 1), ty = clamp((lastMove.clientY - (r.top + r.height / 2)) / 420, -1, 1);
      tilt.style.transform = `rotateY(${tx * 22}deg) rotateX(${-ty * 22}deg)`;
    });
  }
  addEventListener("pointermove", onMove, { passive: true });

  let tipTimer;
  function say(text, ms = 2200) {
    tip.textContent = text;
    tip.classList.add("show");
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => tip.classList.remove("show"), ms);
  }

  /* ------------------------------------------------------------------ background particle network (only while open) */
  const cv = $(".bg"), ctx = cv.getContext("2d");
  let pts = [], bgRaf = 0, mouse = { x: -999, y: -999 };
  function bgSize() {
    const r = panel.getBoundingClientRect();
    cv.width = Math.max(1, Math.round((panel.offsetWidth || 392) * devicePixelRatio));
    cv.height = Math.max(1, Math.round((panel.offsetHeight || 640) * devicePixelRatio));
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    const n = Math.round(((panel.offsetWidth || 392) * (panel.offsetHeight || 640)) / 9000);
    pts = Array.from({ length: n }, () => ({ x: Math.random() * (panel.offsetWidth || 392), y: Math.random() * (panel.offsetHeight || 640), vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, c: ["45,226,176", "56,189,248", "139,92,246"][Math.floor(Math.random() * 3)] }));
  }
  panel.addEventListener("pointermove", (e) => {
    const r = panel.getBoundingClientRect();
    mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  panel.addEventListener("pointerleave", () => (mouse = { x: -999, y: -999 }));
  function bgFrame() {
    const W = panel.offsetWidth, H = panel.offsetHeight;
    ctx.clearRect(0, 0, W, H);
    for (const p of pts) {
      const dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy);
      if (d < 110 && d > 1) { p.vx += (dx / d) * 0.012; p.vy += (dy / d) * 0.012; }
      p.vx *= 0.995; p.vy *= 0.995;
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, 6.283); ctx.fillStyle = `rgba(${p.c},.7)`; ctx.fill();
    }
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 80) { ctx.strokeStyle = `rgba(${a.c},${(1 - d / 80) * 0.25})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
    bgRaf = requestAnimationFrame(bgFrame);
  }
  const bgStart = () => { cancelAnimationFrame(bgRaf); bgSize(); if (!matchMedia("(prefers-reduced-motion: reduce)").matches) bgFrame(); };
  const bgStop = () => cancelAnimationFrame(bgRaf);

  /* ------------------------------------------------------------------ open / close */
  function toggle() { isOpen ? close() : open(); }

  function open(instant) {
    if (isOpen) return;
    isOpen = true;
    if (!instant) { try { chrome.runtime.sendMessage({ type: "NAVI_VOICE_ENSURE" }); } catch (e) {} }
    placePanel();
    panel.classList.toggle("instant", !!instant);
    panel.classList.add("open");
    if (instant) requestAnimationFrame(() => panel.classList.remove("instant"));
    bgStart();
    send({ type: "open_state", open: true });
    setTimeout(() => input.focus({ preventScroll: true }), 120);
  }

  function close() {
    isOpen = false;
    panel.classList.remove("open");
    settingsEl.classList.add("hidden");
    bgStop();
    send({ type: "open_state", open: false });
  }

  /* ------------------------------------------------------------------ talking to the background worker */
  let port = null;
  function connect() {
    if (port) return port;
    try {
      port = chrome.runtime.connect({ name: "navi-panel" });
    } catch (e) {
      return destroy(); // the extension was reloaded: this old copy retires quietly
    }
    port.onMessage.addListener(onBackground);
    port.onDisconnect.addListener(() => { port = null; });
    port.postMessage({ type: "hello" });
    return port;
  }
  function send(m) {
    try {
      (port || connect())?.postMessage(m);
    } catch (e) {
      port = null;
      try { connect()?.postMessage(m); } catch (err) {}
    }
  }

  /* ------------------------------------------------------------------ chat rendering */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function md(text) {
    const inline = (t) =>
      esc(t)
        .replace(/`([^`\n]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
        .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    const out = [];
    let list = null;
    const flush = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const line of String(text).split("\n")) {
      const ul = line.match(/^\s*[-*•]\s+(.*)/), ol = line.match(/^\s*\d+[.)]\s+(.*)/);
      if (ul || ol) {
        const kind = ul ? "ul" : "ol";
        if (list !== kind) { flush(); out.push(`<${kind}>`); list = kind; }
        out.push(`<li>${inline((ul || ol)[1])}</li>`);
      } else {
        flush();
        if (line.trim()) out.push(`<p>${inline(line)}</p>`);
      }
    }
    flush();
    return out.join("");
  }

  const scrollDown = () => requestAnimationFrame(() => (feed.scrollTop = feed.scrollHeight));
  let stepsBox = null, typingEl = null, running = false, lastKind = "idle";
  const pending = new Set(), stepEls = new Map(), cards = new Map();

  function showWelcome() {
    feed.innerHTML = "";
    const w = document.createElement("section");
    w.className = "welcome";
    w.innerHTML = `<div class="big" data-state="idle">${logoSVG("w")}</div>
      <h2>How can I help on this page?</h2>
      <p>I read what's on your screen, find things, fill forms and check your other tabs. I ask before anything important.</p>
      <div class="chips">
        <button class="chip" data-q="Summarize this page and tell me what I can do here.">Summarize this page</button>
        <button class="chip" data-q="Find the apply, register or sign-up option on this site and guide me through it.">Find the apply / register option</button>
        <button class="chip" data-q="Fill in the form on this page using my details from settings. Ask me for anything missing, and don't submit until I confirm.">Fill this form with my details</button>
        <button class="chip" data-q="Look at my other open tabs and tell me what is open and anything important in them.">What's in my other tabs?</button>
        <button class="chip" data-q="Search the web for the official page about this topic and give me the key steps.">Find the official page and steps</button>
      </div>
      <button class="trust"></button>`;
    feed.appendChild(w);
    const trust = w.querySelector(".trust");
    const paint = async () => {
      const { trustAll: ta } = await store.get("trustAll"); const trustAll = ta !== false;
      trust.classList.toggle("on", trustAll);
      trust.textContent = trustAll ? "✓ Minima may work on every site (except blocked ones)" : "Allow Minima on every site (except blocked ones)";
    };
    paint();
    trust.addEventListener("click", async () => {
      const { trustAll: ta2 } = await store.get("trustAll");
      await store.set({ trustAll: ta2 === false });
      paint();
    });
    w.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => ask(c.dataset.q)));
  }

  const hideWelcome = () => feed.querySelector(".welcome")?.remove();

  function addUser(text) {
    hideWelcome();
    const m = document.createElement("div");
    m.className = "msg user";
    m.innerHTML = `<div class="bubble"></div>`;
    m.firstChild.textContent = text;
    feed.appendChild(m);
    stepsBox = null;
    scrollDown();
  }

  function addAgent(text, animate, isErr) {
    hideWelcome();
    const m = document.createElement("div");
    m.className = "msg agent" + (isErr ? " err" : "");
    const b = document.createElement("div");
    b.className = "bubble";
    m.appendChild(b);
    feed.appendChild(m);
    if (!animate) b.innerHTML = md(text);
    else {
      const words = text.split(/(\s+)/);
      let i = 0;
      const per = Math.max(2, Math.ceil(words.length / 45));
      const tick = () => {
        i = Math.min(words.length, i + per);
        b.innerHTML = md(words.slice(0, i).join(""));
        scrollDown();
        if (i < words.length) setTimeout(tick, 22);
      };
      tick();
    }
    stepsBox = null;
    scrollDown();
  }

  function addNote(text) {
    const n = document.createElement("div");
    n.className = "note";
    n.textContent = text;
    feed.appendChild(n);
    scrollDown();
  }

  function addStep(html, cls, id) {
    hideWelcome();
    if (!stepsBox) {
      stepsBox = document.createElement("div");
      stepsBox.className = "steps";
      feed.appendChild(stepsBox);
    }
    const el = document.createElement("div");
    el.className = "step " + cls;
    el.innerHTML = html;
    stepsBox.appendChild(el);
    if (id) stepEls.set(id, el);
    scrollDown();
  }

  function addCard(id, kind, text) {
    hideWelcome();
    const c = document.createElement("div");
    c.className = "card" + (kind === "ask" ? " ask" : "");
    cards.set(id, c);
    if (kind === "ask") {
      c.innerHTML = `<h4>Minima needs your input</h4><p></p><input placeholder="Type your answer…"/><div class="row"><button class="btn p">Send answer</button></div>`;
      c.querySelector("p").textContent = text;
      const field = c.querySelector("input");
      const go = () => { const v = field.value.trim(); if (v) send({ type: "answer", id, text: v }); };
      c.querySelector("button").addEventListener("click", go);
      field.addEventListener("keydown", (e) => e.key === "Enter" && go());
      setTimeout(() => field.focus(), 100);
    } else {
      c.innerHTML = `<h4>Permission needed</h4><p></p><div class="row"><button class="btn p" data-a="1">Allow</button><button class="btn d" data-a="0">Deny</button></div>`;
      c.querySelector("p").textContent = text;
      c.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => send({ type: "approval", id, allow: b.dataset.a === "1" })));
    }
    feed.appendChild(c);
    pending.add(id);
    scrollDown();
  }

  function setTyping(on) {
    if (on && !typingEl) {
      typingEl = document.createElement("div");
      typingEl.className = "msg agent";
      typingEl.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
      feed.appendChild(typingEl);
      scrollDown();
    } else if (!on && typingEl) {
      typingEl.remove();
      typingEl = null;
    }
  }

  function refreshStatus() {
    let kind = "idle", label = "Ready", logo = "idle";
    if (running) {
      if (pending.size || permOpen) { kind = "waiting"; label = "Needs you"; logo = "waiting"; }
      else { kind = "working"; label = "Working"; logo = "thinking"; }
    } else if (lastKind === "done") { kind = "done"; label = "Done"; logo = "done"; }
    else if (lastKind === "error") { kind = "error"; label = "Problem"; }
    pill.className = "pill " + kind;
    pill.querySelector("b").textContent = label;
    fab.dataset.state = logo;
    mini.dataset.state = logo;
    sendBtn.classList.toggle("hidden", running);
    stopBtn.classList.toggle("hidden", !running);
    setTyping(running && !pending.size && !permOpen);
    if (logo === "waiting") say("Needs your OK", 4000);
    if (logo === "done") say("Done ✓", 2000);
  }

  function setRunning(on) { running = on; refreshStatus(); }

  function handle(ev, instant) {
    switch (ev.type) {
      case "user": addUser(ev.text); lastKind = "idle"; running = true; break;
      case "say":                                                        // spoken at the START of a step: "Opening WhatsApp."
        if (!instant && !(window.speechSynthesis && speechSynthesis.speaking)) speakIfVoice(ev.text, true);
        break;
      case "thought": setTyping(false); addStep(esc(ev.text), "thought ok"); break;
      case "step":
        setTyping(false);
        if (ev.phase === "start") addStep(`<b>${esc(ev.label)}</b>`, "run", ev.id);
        if (ev.phase === "start" && /free limit|per-minute limit/i.test(ev.label || "") && !pauseTold && (voiceTask || speakTyped)) {
          pauseTold = true;                                              // tell her out loud, instead of silence
          speak("One moment. Groq's free plan needs a short pause. A paid key makes me instant.");
        }
        else {
          const el = stepEls.get(ev.id);
          if (el) {
            el.classList.remove("run");
            el.classList.add(ev.phase === "ok" ? "ok" : "fail");
            if (ev.detail) el.insertAdjacentHTML("beforeend", ` <span>– ${esc(ev.detail)}</span>`);
          }
        }
        break;
      case "approval_request": setTyping(false); addCard(ev.id, "approve", ev.text); if (!instant) speakIfVoice("I need your approval on the screen. " + ev.text, true); break;
      case "question":                                                   // she needs one detail: asked as a normal message, no extra box
        setTyping(false); addAgent(ev.text, !instant); pendingAsk = ev.id; pending.add(ev.id);
        input.placeholder = "Type your answer (or just say it)…";
        if (!instant && (voiceTask || speakTyped)) speak(ev.text, { listenAfter: true });   // she asks out loud, then listens for your answer
        break;
      case "resolved": {
        const c = cards.get(ev.id);
        if (c) { c.classList.add("done"); c.insertAdjacentHTML("beforeend", `<p class="res">${esc(ev.text)}</p>`); }
        pending.delete(ev.id);
        break;
      }
      case "final": running = false; pendingAsk = null; lastKind = "done"; setTyping(false); addAgent(ev.text, !instant); if (!instant) speakIfVoice(ev.text); break;
      case "error": running = false; pendingAsk = null; lastKind = "error"; setTyping(false); addAgent(ev.text, false, true); if (!instant) speakIfVoice("Sorry. " + ev.text); break;
      case "stopped": voiceTask = false; running = false; pendingAsk = null; lastKind = "idle"; setTyping(false); addNote("Stopped."); break;
    }
    if (!instant) refreshStatus();
  }

  /* ------------------------------------------------------------------ site permission sheet */
  let permOpen = false;
  function showPermission(id, host) {
    permOpen = true;
    root.querySelector(".sheet")?.remove();
    const s = document.createElement("div");
    s.className = "sheet";
    s.innerHTML = `<div class="sheet-card"><div class="shield">${ICON.shield}</div>
      <h3>Allow Minima on <span></span>?</h3>
      <p>Minima will read this site and click or type on it while you watch. It never types passwords, OTPs or card numbers.</p>
      <div class="row"><button class="btn g" data-c="once">Just this time</button><button class="btn p" data-c="always">Always on this site</button></div>
      <button class="linkbtn mint" data-c="all">Allow on every site (except blocked ones)</button><br>
      <button class="linkbtn" data-c="deny">Not now</button></div>`;
    s.querySelector("h3 span").textContent = host;
    s.querySelectorAll("[data-c]").forEach((b) =>
      b.addEventListener("click", async () => {
        let choice = b.dataset.c;
        if (choice === "all") { await store.set({ trustAll: true }); choice = "once"; }
        send({ type: "permission_response", id, choice });
        s.remove();
        permOpen = false;
        refreshStatus();
      })
    );
    panel.appendChild(s);
    if (!isOpen) open();
    refreshStatus();
  }

  /* ------------------------------------------------------------------ messages from the background */
  function onBackground(m) {
    if (m.type === "replay") {
      feed.innerHTML = "";
      stepsBox = null; typingEl = null; pending.clear(); stepEls.clear(); cards.clear();
      running = false; lastKind = "idle";
      if (!m.events.length) showWelcome();
      for (const ev of m.events) handle(ev, true);
      running = !!m.running;
      refreshStatus();
      if (m.open && !isOpen) open(true);
    } else if (m.type === "event") handle(m.ev, false);
    else if (m.type === "permission_request") showPermission(m.id, m.host);
  }

  /* ------------------------------------------------------------------ composer & buttons */
  let pendingAsk = null;
  function ask(text) {
    text = (text || "").trim();
    if (!text) return;
    input.value = "";
    autoGrow();
    if (pendingAsk) {                                       // this is the answer to her question, not a new task
      const id = pendingAsk;
      pendingAsk = null; pending.delete(id); input.placeholder = "Ask about this page, or tell me what to do…";
      addUser(text);
      send({ type: "answer", id, text });
      return;
    }
    const q = NAVI.quickOpen(text);                       // "open my whatsapp": do it right now, no AI needed
    if (q && !running) {
      addUser(text);
      try { chrome.runtime.sendMessage({ type: "NAVI_QUICK_OPEN", url: q.url }); } catch (e) {}
      const msg = `Opening ${q.name} for you.`;
      addAgent(msg + " Sign in there if it asks, then tell me what to do.", true);
      if (voiceTask || speakTyped) speak(msg);
      voiceTask = false;
      return;
    }
    pauseTold = false;
    if ((voiceTask || speakTyped) && !running) speak(ACKS[(ackN++) % ACKS.length]);   // reacts at once, while the AI is thinking
    send({ type: "goal", text });
  }
  const ACKS = ["Sure, on it!", "Okay, working on it.", "Got it, give me a moment.", "Right away!"];
  let ackN = 0, pauseTold = false;
  function autoGrow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 110) + "px"; }
  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!running) ask(input.value); }
  });
  // Keep the website's keyboard shortcuts (Gmail's "g", YouTube's "k", ...) from reacting while you type to Minima.
  for (const t of ["keydown", "keyup", "keypress"]) root.addEventListener(t, (e) => e.stopPropagation());
  root.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen) close(); });

  async function loadSettings() {
    const v = await store.get(["trustAll", "rememberPages", "profile", "extraBlocked", "serverUrl", "token", "askFirst", "ttsVoice", "voiceWake", "voiceName", "voiceLang", "speakAnswers", "speakTyped", "allowWhatsapp"]);
    $("allowWhatsapp").checked = v.allowWhatsapp !== false;
    $("speakTyped").checked = v.speakTyped !== false;
    $("voiceWake").checked = v.voiceWake !== false;
    $("voiceName").value = v.voiceName || "";
    $("voiceLang").value = v.voiceLang || "en-IN";
    $("speakAnswers").checked = v.speakAnswers !== false;
    $("#trustAll").checked = v.trustAll !== false;
    $("#askFirst").checked = !!v.askFirst;
    loadVoices().then((all) => {
      const lang = ($("voiceLang").value || "en-IN").split("-")[0];
      const sel = $("ttsVoice");
      sel.innerHTML = '<option value="">Automatic</option>' + all.filter((x) => x.lang.startsWith(lang)).map((x) => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join("");
      sel.value = v.ttsVoice || "";
    });
    $("#rememberPages").checked = v.rememberPages !== false;
    $("#profile").value = v.profile || "";
    $("#extraBlocked").value = v.extraBlocked || "";
    $("#serverUrl").value = v.serverUrl || "";
    $("#token").value = v.token || "";
  }

  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    switch (b.dataset.act) {
      case "send": ask(input.value); break;
      case "mic": toggleMic(); break;
      case "miccheck": try { chrome.runtime.sendMessage({ type: "NAVI_VOICE_TEST" }); } catch (e) {} break;
      case "stop": send({ type: "stop" }); break;
      case "close": close(); break;
      case "new":
        send({ type: "reset" });
        pending.clear(); stepEls.clear(); cards.clear(); stepsBox = null; running = false; lastKind = "idle";
        showWelcome(); refreshStatus();
        break;
      case "settings":
        if (settingsEl.classList.contains("hidden")) { await loadSettings(); settingsEl.classList.remove("hidden"); }
        else settingsEl.classList.add("hidden");
        break;
      case "save":
        await store.set({
          trustAll: $("#trustAll").checked,
          askFirst: $("#askFirst").checked,
          ttsVoice: $("#ttsVoice").value,
          rememberPages: $("#rememberPages").checked,
          profile: $("#profile").value,
          extraBlocked: $("#extraBlocked").value,
          serverUrl: $("#serverUrl").value.trim(),
          token: $("#token").value.trim(),
          voiceWake: $("#voiceWake").checked,
          voiceName: $("#voiceName").value.trim(),
          voiceLang: $("#voiceLang").value,
          speakAnswers: $("#speakAnswers").checked,
          speakTyped: $("#speakTyped").checked,
          allowWhatsapp: $("#allowWhatsapp").checked,
        });
        settingsEl.classList.add("hidden");
        addNote("Settings saved.");
        break;
      case "forget":
        await store.set({ allowedHosts: [], trustAll: false });
        $("#trustAll").checked = false;
        b.textContent = "Done ✓";
        setTimeout(() => (b.textContent = "Forget site permissions"), 1500);
        break;
    }
  });

  /* ------------------------------------------------------------------ lifecycle */
  chrome.runtime.onMessage.addListener((m) => {
    if (m?.type === "NAVI_TOGGLE") toggle();
    else if (m?.type === "NAVI_VOICE_GOAL") voiceGoal(m);
  });

  /* ------------------------------------------------------------------ voice: commands in, spoken answers out */
  let voiceTask = false;   // the running task was started by voice, so the answer is spoken
  function voiceGoal(m) {
    micBtn.classList.remove("on"); clearTimeout(micTimer); if (micHolder) input.placeholder = micHolder;
    if (!isOpen) open();
    if (m.kind === "note") { addNote(m.text); return; }
    if (m.kind === "wake_quiet") { if (!running) addNote("Listening…"); return; }   // heard her name while you are still talking: just show it
    if (m.kind === "wake") { addNote("Yes? I'm listening…"); speak("Yes?"); return; }
    const text = (m.text || "").trim();
    if (!text) return;
    if (NAVI.isStopCommand(text)) {
      if (running) { send({ type: "stop" }); speak("Okay, stopped."); }
      return;
    }
    if (pendingAsk) { voiceTask = true; ask(text); return; }                         // you are answering her question by voice
    if (running) { addNote("I'm still working on the last task. Say “stop” to cancel it."); speak("I'm still busy. Say stop to cancel."); return; }
    voiceTask = true;
    ask(text);
  }

  /* The mic button: listens right here, right now (no extra tab). One sentence in, then it is sent as a task. */
  let micRec = null;
  let micTimer = null;
  function toggleMic() {
    if (!isOpen) open();
    if (micBtn.classList.contains("on")) {                                // press again = cancel
      micBtn.classList.remove("on"); clearTimeout(micTimer); input.placeholder = micHolder;
      try { chrome.runtime.sendMessage({ type: "NAVI_VOICE_CTL", cancelOnce: true }); } catch (e) {}
      return;
    }
    try { speechSynthesis.cancel(); } catch (e) {}
    micHolder = input.placeholder;
    micBtn.classList.add("on");
    input.placeholder = "Listening… speak now";
    try { chrome.runtime.sendMessage({ type: "NAVI_VOICE_START" }); } catch (e) { addNote("Could not reach the microphone helper. Reload the extension."); }
    clearTimeout(micTimer);
    micTimer = setTimeout(() => {
      if (!micBtn.classList.contains("on")) return;
      micBtn.classList.remove("on"); input.placeholder = micHolder;
      addNote("I didn't hear anything. Open Settings and press “Microphone check”: its green bar should move when you speak. If it stays flat, choose the right microphone there.");
    }, 14000);
  }
  let micHolder = "";

  // ONE voice, always the same: wait until Chrome has loaded its voices (the first sentence otherwise gets a different default voice),
  // then take the one chosen in Settings, or the best match for your language in a fixed order.
  let voiceListP = null;
  function loadVoices() {
    if (!("speechSynthesis" in window)) return Promise.resolve([]);
    if (voiceListP) return voiceListP;
    voiceListP = new Promise((res) => {
      const now = speechSynthesis.getVoices();
      if (now.length) return res(now);
      const t = setTimeout(() => res(speechSynthesis.getVoices()), 1500);
      speechSynthesis.addEventListener("voiceschanged", () => { clearTimeout(t); res(speechSynthesis.getVoices()); }, { once: true });
    });
    return voiceListP;
  }
  const VOICE_ORDER = [/neerja/i, /heera/i, /swara/i, /aria/i, /jenny/i, /zira/i, /google.*female|female/i, /samantha/i, /google/i];
  async function pickVoice(lang, chosen) {
    const all = await loadVoices();
    if (chosen) { const f = all.find((v) => v.name === chosen); if (f) return f; }
    const same = all.filter((v) => v.lang === lang || v.lang.startsWith(lang.split("-")[0])).sort((a, b) => a.name.localeCompare(b.name));
    for (const re of VOICE_ORDER) { const f = same.find((v) => re.test(v.name)); if (f) return f; }
    return same[0] || null;
  }
  function plain(text) {
    return String(text).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/https?:\/\/\S+/g, "the link").replace(/[*_#>`~|]/g, " ").replace(/\s+/g, " ").trim();
  }
  async function speak(text, opts = {}) {
    const v = await store.get(["speakAnswers", "voiceLang", "ttsVoice"]);
    if (v.speakAnswers === false || !("speechSynthesis" in window)) return;
    let t = plain(text);
    if (t.length > 380) t = t.slice(0, 380).replace(/[^.!?]*$/, "").trim() || t.slice(0, 380);
    if (!t) return;
    host.dataset.lastSpoken = t;  // lets tests (and curious people) see what was said
    const lang = v.voiceLang || "en-IN";
    const u = new SpeechSynthesisUtterance(t);
    u.lang = lang;
    const voice = await pickVoice(lang, v.ttsVoice);
    if (voice) u.voice = voice;
    u.rate = 1.05; u.pitch = 1.0;
    const mute = (on) => { try { chrome.runtime.sendMessage({ type: "NAVI_VOICE_CTL", mute: on }); } catch (e) {} };
    u.onstart = () => mute(true);
    u.onend = u.onerror = () => {
      mute(false);
      if (opts.listenAfter && pendingAsk) setTimeout(() => { try { chrome.runtime.sendMessage({ type: "NAVI_VOICE_START" }); } catch (e) {} }, 250);
    };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
  let speakTyped = true;
  store.get("speakTyped").then((v) => { speakTyped = v.speakTyped !== false; }).catch(() => {});
  chrome.storage.onChanged.addListener((c) => { if (c.speakTyped) speakTyped = c.speakTyped.newValue !== false; });
  function speakIfVoice(text, keepTask) {
    if (!voiceTask && !speakTyped) return;
    if (!keepTask) voiceTask = false;
    speak(text);
  }

  // If the user adds this site to the blocked list, the logo disappears right away.
  const onStorage = (changes) => {
    if (changes.extraBlocked || changes.allowWhatsapp) {
      store.get(["extraBlocked", "allowWhatsapp"]).then((v) => {
        if (NAVI.hostMatches(location.hostname, NAVI.blockedList(v.extraBlocked, v.allowWhatsapp))) destroy();
      });
    }
  };
  chrome.storage.onChanged.addListener(onStorage);

  function destroy() {
    try { chrome.storage.onChanged.removeListener(onStorage); } catch (e) {}
    removeEventListener("pointermove", onMove);
    cancelAnimationFrame(bgRaf);
    try { port?.disconnect(); } catch (e) {}
    host.remove();
    try { speechSynthesis.cancel(); } catch (e) {}
    window.__naviOverlay = false;
  }

  (async () => {
    const v = await store.get(["extraBlocked", "allowWhatsapp"]);
    if (NAVI.hostMatches(location.hostname, NAVI.blockedList(v.extraBlocked, v.allowWhatsapp))) return destroy();
    await initPosition();
    showWelcome();
    connect(); // asks the background for this tab's saved chat, so it survives page changes
    refreshStatus();
  })();
})();
