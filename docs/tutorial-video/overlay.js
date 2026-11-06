
(() => {
  const css = `
  #__ov_cur{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:transform .55s cubic-bezier(.45,.05,.25,1)}
  #__ov_cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
  .__ov_rip{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #c63c33;z-index:2147483646;pointer-events:none;animation:__rip .6s ease-out forwards}
  @keyframes __rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
  #__ov_title{position:fixed;left:50%;top:14px;translate:-50% 0;white-space:nowrap;z-index:2147483645;pointer-events:none;background:#8f1414;color:#fff;font:700 17px/1 Archivo,Inter,Arial,sans-serif;padding:10px 16px;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.25);opacity:0;transform:translateY(-8px);transition:all .35s}
  #__ov_title.on{opacity:1;transform:none}
  #__ov_keys{position:fixed;left:50%;bottom:120px;transform:translateX(-50%) scale(.9);z-index:2147483645;pointer-events:none;opacity:0;transition:all .25s;display:flex;gap:8px}
  #__ov_keys.on{opacity:1;transform:translateX(-50%) scale(1)}
  #__ov_keys span{background:#2b2b2b;color:#fff;font:700 26px/1 Inter,Arial,sans-serif;padding:14px 20px;border-radius:10px;border-bottom:4px solid #000;box-shadow:0 8px 24px rgba(0,0,0,.3)}
  #__ov_keys b{color:#2b2b2b;font:700 26px/1 Inter,Arial;align-self:center}
  #__ov_hl{position:fixed;z-index:2147483644;pointer-events:none;border:3px solid #c63c33;border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.18);opacity:0;transition:all .35s}
  #__ov_hl.on{opacity:1}
  #__ov_card{position:fixed;inset:0;z-index:2147483640;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#2b2b2b 0%,#3a1010 55%,#8f1414 100%);color:#fff;font-family:Archivo,Inter,Arial,sans-serif;opacity:0;pointer-events:none;transition:opacity .6s}
  #__ov_card.on{opacity:1}
  #__ov_card .logo{background:#fff;color:#8f1414;font-weight:800;font-size:46px;padding:6px 18px;border-radius:4px;margin-bottom:28px}
  #__ov_card h1{font-size:64px;margin:0 0 14px;font-weight:800;letter-spacing:-.5px}
  #__ov_card p{font-size:26px;margin:0;opacity:.85;font-family:Inter,Arial,sans-serif}
  #__ov_card ul{margin:34px 0 0;padding:0;list-style:none;font:500 26px/1.9 Inter,Arial,sans-serif}
  #__ov_card li::before{content:counter(s);counter-increment:s;display:inline-block;width:40px;height:40px;line-height:40px;text-align:center;border-radius:50%;background:#fff;color:#8f1414;font-weight:800;margin-right:16px}
  #__ov_card ul{counter-reset:s}
  #__ov_xl{position:fixed;left:50%;top:50%;transform:translate(-50%,-46%) scale(.96);z-index:2147483642;background:#fff;border-radius:10px;box-shadow:0 30px 80px rgba(0,0,0,.45);overflow:hidden;opacity:0;transition:all .45s;pointer-events:none;font:14px/1.2 Calibri,Inter,Arial,sans-serif;width:980px}
  #__ov_xl.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
  #__ov_xl .bar{background:#1d6f42;color:#fff;padding:10px 16px;font-weight:600;font-size:15px}
  #__ov_xl table{border-collapse:collapse;width:100%}
  #__ov_xl td{border:1px solid #d4d4d4;padding:7px 9px;color:#222;white-space:nowrap}
  #__ov_xl td.h{background:#f3f3f3;color:#666;text-align:center;font-size:12px;width:28px}
  #__ov_xl tr.sel td:not(.h){background:#d6ead9}
  #__ov_xl tr.sel.top td:not(.h){border-top:2px solid #1d6f42}
  #__ov_xl tr.sel.bot td:not(.h){border-bottom:2px solid #1d6f42}
  #__ov_xl tr.sel.sel td:not(.h):first-of-type{}
  #__ov_xl tr.ant td:not(.h){border-top:2px dashed #1d6f42}
  `;
  const boot = () => {
    if (document.getElementById("__ov_cur")) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const cur = document.createElement("div"); cur.id = "__ov_cur";
    cur.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 11.2-6.6.9 3.9 7.4-2.7 1.4-3.9-7.5L4 20z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cur);
    for (const id of ["__ov_title", "__ov_keys", "__ov_hl", "__ov_card", "__ov_xl"]) { const d = document.createElement("div"); d.id = id; document.body.appendChild(d); }
    const s = window.__ovState || {};
    if (s.x != null) { cur.style.transition = "none"; cur.style.transform = "translate(" + s.x + "px," + s.y + "px)"; requestAnimationFrame(() => cur.style.transition = ""); }
    if (s.title) { const t = document.getElementById("__ov_title"); t.textContent = s.title; t.classList.add("on"); }
  };
  try { window.__ovState = JSON.parse(sessionStorage.getItem("__ov") || "{}"); } catch { window.__ovState = {}; }
  const save = () => { try { sessionStorage.setItem("__ov", JSON.stringify(window.__ovState)); } catch {} };
  window.__ov = {
    cursor(x, y, ms) { boot(); const c = document.getElementById("__ov_cur"); c.style.transitionDuration = (ms ?? 550) + "ms"; c.style.transform = "translate(" + x + "px," + y + "px)"; window.__ovState.x = x; window.__ovState.y = y; save(); },
    ripple(x, y) { const r = document.createElement("div"); r.className = "__ov_rip"; r.style.left = x + "px"; r.style.top = y + "px"; document.body.appendChild(r); setTimeout(() => r.remove(), 700); },
    title(t) { boot(); const e = document.getElementById("__ov_title"); if (!t) { e.classList.remove("on"); } else { e.classList.remove("on"); setTimeout(() => { e.textContent = t; e.classList.add("on"); }, 180); } window.__ovState.title = t; save(); },
    keys(list, ms) { boot(); const e = document.getElementById("__ov_keys"); e.innerHTML = list.map((k) => "<span>" + k + "</span>").join("<b>+</b>"); e.classList.add("on"); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove("on"), ms || 1400); },
    hl(r) { boot(); const e = document.getElementById("__ov_hl"); if (!r) return e.classList.remove("on"); const p = 8; Object.assign(e.style, { left: r.x - p + "px", top: r.y - p + "px", width: r.width + 2 * p + "px", height: r.height + 2 * p + "px" }); e.classList.add("on"); },
    card(html) { boot(); const e = document.getElementById("__ov_card"); if (!html) return e.classList.remove("on"); e.innerHTML = html; e.classList.add("on"); },
    xl(html, on) { boot(); const e = document.getElementById("__ov_xl"); if (html != null) e.innerHTML = html; e.classList.toggle("on", !!on); },
    xlSel(from, to) { document.querySelectorAll("#__ov_xl tr[data-r]").forEach((tr) => { const r = +tr.dataset.r; tr.classList.toggle("sel", r >= from && r <= to); tr.classList.toggle("top", r === from); tr.classList.toggle("bot", r === to); }); },
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
