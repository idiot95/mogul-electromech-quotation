// ERP training video engine.
// Drives a real Chromium window on a virtual X display, captures it with ffmpeg,
// voices each scene (Kokoro af_heart by default), then mixes narration + burned-in captions.
//
// Usage: node training-videos/engine.js training-videos/scripts/F1.js
'use strict';
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cards = require('./cards'); // opening notice, title and end cards (CARD_THEME=paper|green|split)

const ROOT = __dirname;
const BASE = process.env.ERP_URL || 'https://erpstaging.hatimcarbon.com';
const PIPER = process.env.PIPER_BIN || 'piper';
const VOICE = process.env.PIPER_VOICE; // path to .onnx
const W = 1920, H = 1080, FPS = 30, DISPLAY = process.env.REC_DISPLAY || ':99';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Always blurred on camera: task text on My Work, and customer / amount / reference
// columns on list views. Scripts can add more with `privacyCSS`.
const PRIVACY_CSS = [
  '.hcc-mw-urgent',
  '.list-row .list-subject a', '.list-row .list-subject .ellipsis',
  '.list-row .list-row-col.text-right',
].join(',') + '{filter:blur(6px)!important}';

// ---------- narration ----------
// TTS_PROVIDER = kokoro (default: offline, American, voice af_heart) | piper | omnivoice | elevenlabs | azure
//   kokoro:     KOKORO_DIR, KOKORO_VOICE (default af_heart — the house voice), KOKORO_PYTHON (python with kokoro-onnx)
//   omnivoice:  OMNIVOICE_PYTHON, OMNIVOICE_SRC, OMNIVOICE_REF, OMNIVOICE_REF_TEXT (see tts_omnivoice.py)
//   elevenlabs: ELEVEN_VOICE_ID (default: a calm narrator voice), ELEVEN_MODEL (default eleven_multilingual_v2)
//   azure:      AZURE_TTS_REGION (e.g. centralindia), AZURE_VOICE (default en-IN-NeerjaNeural)
// API keys are never read here: the cloud session's network proxy adds them to the request.
// Elsewhere, set ELEVEN_API_KEY / AZURE_TTS_KEY.
const PROVIDER = process.env.TTS_PROVIDER || 'kokoro';
function voiceId() {
  if (PROVIDER === 'elevenlabs') return 'el:' + (process.env.ELEVEN_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb') + ':' + (process.env.ELEVEN_MODEL || 'eleven_multilingual_v2');
  if (PROVIDER === 'azure') return 'az:' + (process.env.AZURE_VOICE || 'en-IN-NeerjaNeural');
  if (PROVIDER === 'omnivoice') return 'omnivoice:' + crypto.createHash('sha1').update(fs.readFileSync(process.env.OMNIVOICE_REF)).digest('hex').slice(0, 10);
  if (PROVIDER === 'kokoro') return 'kokoro:' + (process.env.KOKORO_VOICE || 'af_heart') + ':' + (process.env.KOKORO_SPEED || '1.0');
  return 'piper:' + VOICE;
}
function synth(text, out) {
  if (PROVIDER === 'piper') {
    execFileSync(PIPER, ['-m', VOICE, '-f', out, '--length_scale', '1.05', '--sentence_silence', '0.35'],
      { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
    return;
  }
  if (PROVIDER === 'kokoro') {
    execFileSync(process.env.KOKORO_PYTHON || 'python3', [path.join(ROOT, 'tts_kokoro.py'), out],
      { input: text, stdio: ['pipe', 'ignore', 'inherit'] });
    return;
  }
  if (PROVIDER === 'omnivoice') throw new Error('omnivoice line missing after batch: ' + text.slice(0, 40));
  const mp3 = out.replace(/\.wav$/, '.mp3');
  let args;
  if (PROVIDER === 'elevenlabs') {
    const [, id, model] = voiceId().split(':');
    args = ['-sS', '--fail-with-body', '-o', mp3, '-X', 'POST',
      `https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=mp3_44100_128`,
      '-H', `xi-api-key: ${process.env.ELEVEN_API_KEY || 'injected-by-proxy'}`, '-H', 'Content-Type: application/json',
      '-d', JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true } })];
  } else if (PROVIDER === 'azure') {
    const voice = voiceId().slice(3), lang = voice.split('-').slice(0, 2).join('-');
    const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    args = ['-sS', '--fail-with-body', '-o', mp3, '-X', 'POST',
      `https://${process.env.AZURE_TTS_REGION || 'centralindia'}.tts.speech.microsoft.com/cognitiveservices/v1`,
      '-H', `Ocp-Apim-Subscription-Key: ${process.env.AZURE_TTS_KEY || 'injected-by-proxy'}`,
      '-H', 'Content-Type: application/ssml+xml', '-H', 'X-Microsoft-OutputFormat: audio-24khz-96kbitrate-mono-mp3',
      '-d', `<speak version="1.0" xml:lang="${lang}"><voice name="${voice}"><prosody rate="-4%">${esc}</prosody></voice></speak>`];
  } else throw new Error('Unknown TTS_PROVIDER ' + PROVIDER);
  execFileSync('curl', args, { stdio: ['ignore', 'ignore', 'inherit'] });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp3, '-ar', '44100', '-ac', '1', out]);
  fs.unlinkSync(mp3);
}
const cachePath = (text, cacheDir) => path.join(cacheDir, crypto.createHash('sha1').update(voiceId() + '|' + text).digest('hex').slice(0, 16) + '.wav');
// OmniVoice loads a 3 GB model, so all missing lines are voiced in one batch first.
function prevoice(texts, cacheDir) {
  if (PROVIDER !== 'omnivoice') return;
  const jobs = [...new Set(texts)].map(text => ({ text, out: cachePath(text, cacheDir) })).filter(j => !fs.existsSync(j.out));
  if (!jobs.length) return;
  const jf = path.join(cacheDir, 'omnivoice-jobs.json'); fs.writeFileSync(jf, JSON.stringify(jobs));
  execFileSync(process.env.OMNIVOICE_PYTHON || 'python3', [path.join(ROOT, 'tts_omnivoice.py'), jf], { stdio: ['ignore', 'ignore', 'inherit'] });
}
function tts(text, cacheDir) {
  const out = cachePath(text, cacheDir);
  if (!fs.existsSync(out)) synth(text, out);
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString());
  return { file: out, dur };
}

// ---------- in-page overlays (cursor, click ripple, highlight, privacy blur) ----------
const INIT = `(() => {
  // Suppress the once-per-login "Your work today" pop-up (hcc_erp_edits).
  const g = Storage.prototype.getItem;
  Storage.prototype.getItem = function (k) {
    if (k === 'hcc_my_work_seen') { try { return window.frappe.boot.hcc_login_key; } catch (e) {} }
    return g.call(this, k);
  };
  if (window.top !== window) return;
  const svg = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M5 2.5l13.5 9.2-6.3 1.3 3.6 7.2-2.9 1.4-3.6-7.3L5 18.6z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const mk = () => {
    if (document.getElementById('__cur') || !document.documentElement) return;
    const c = document.createElement('div'); c.id = '__cur'; c.innerHTML = svg;
    Object.assign(c.style, { position: 'fixed', left: 0, top: 0, zIndex: 2147483647, pointerEvents: 'none', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.35))' });
    const p = JSON.parse(sessionStorage.getItem('__curpos') || '[960,540]');
    c.style.transform = 'translate(' + (p[0] - 5) + 'px,' + (p[1] - 3) + 'px)';
    document.documentElement.appendChild(c);
    const st = document.createElement('style');
    st.textContent = '.__blur{filter:blur(7px)!important}.__hl{position:fixed;z-index:2147483640;pointer-events:none;border:3px solid #f5a623;border-radius:10px;box-shadow:0 0 0 6px rgba(245,166,35,.22);transition:opacity .3s}';
    document.documentElement.appendChild(st);
  };
  document.addEventListener('mousemove', e => {
    mk(); const c = document.getElementById('__cur');
    if (c) c.style.transform = 'translate(' + (e.clientX - 5) + 'px,' + (e.clientY - 3) + 'px)';
    sessionStorage.setItem('__curpos', JSON.stringify([e.clientX, e.clientY]));
  }, true);
  document.addEventListener('mousedown', e => {
    const r = document.createElement('div');
    Object.assign(r.style, { position: 'fixed', left: (e.clientX - 22) + 'px', top: (e.clientY - 22) + 'px', width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(245,166,35,.5)', zIndex: 2147483646, pointerEvents: 'none', transition: 'transform .5s ease-out, opacity .5s ease-out' });
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(1.9)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 600);
  }, true);
  document.addEventListener('DOMContentLoaded', mk);
  // Native title tooltips are drawn by the browser and end up in the recording: strip them.
  const untitle = root => { (root.querySelectorAll ? root : document).querySelectorAll('[title]').forEach(e => { e.setAttribute('data-hcc-title', e.getAttribute('title')); e.removeAttribute('title'); }); if (root.hasAttribute && root.hasAttribute('title')) { root.setAttribute('data-hcc-title', root.getAttribute('title')); root.removeAttribute('title'); } };
  new MutationObserver(ms => ms.forEach(m => { if (m.type === 'attributes') untitle(m.target); else m.addedNodes.forEach(n => n.nodeType === 1 && untitle(n)); }))
    .observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  const st2 = document.createElement('style');
  st2.textContent = '.tooltip,[role=tooltip]{display:none!important}html.__carding #__cur{display:none!important}';
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st2));
  setInterval(mk, 500);
})();`;

// ---------- helpers handed to each scene ----------
function makeHelpers(page) {
  let cur = { x: 960, y: 540 };
  const h = {
    page, BASE,
    sleep,
    // Navigate without showing loading screens: inside the app, the current screen is held
    // as a still while the next one loads, then cross-faded. A full page load happens only
    // when the ERP is not open yet (off camera, before recording).
    async go(route) {
      const here = await page.evaluate(() => location.pathname).catch(() => '');
      if (here.replace(/\/$/, '') === route.replace(/\/$/, '')) return;
      const spa = await page.evaluate(() => !!(window.frappe && frappe.set_route)).catch(() => false);
      if (!spa) {
        await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
        await h.ready();
        return;
      }
      await h.transition(() => page.evaluate(r => frappe.set_route(r.replace(/^\/+/, '')), route));
      const now = await page.evaluate(() => location.pathname);
      if (now.replace(/\/$/, '') !== route.replace(/\/$/, '')) throw new Error(`navigation to ${route} ended at ${now}`);
    },
    // Wait until the page has finished loading: network quiet, no skeletons or "Loading..." text.
    async ready(max = 12000) {
      const end = Date.now() + max;
      await page.waitForLoadState('networkidle', { timeout: max }).catch(() => {});
      while (Date.now() < end) {
        const busy = await page.evaluate(() => {
          const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
          if ([...document.querySelectorAll('[class*=skeleton],[class*=placeholder],.splash,#freeze')].some(vis)) return true;
          return [...document.querySelectorAll('body *')].some(e => e.children.length === 0 && /^Loading\.*$/.test(e.textContent.trim()) && vis(e));
        }).catch(() => true);
        if (!busy) break;
        await sleep(150);
      }
      await sleep(400);
    },
    // Run an action that changes the screen (route change, Enter in search, a click that opens
    // a page) under a still of the current screen, then reveal the loaded result.
    async transition(action) {
      const shot = (await page.screenshot({ type: 'jpeg', quality: 92 })).toString('base64');
      await page.evaluate(src => {
        const d = document.createElement('div'); d.id = '__still';
        Object.assign(d.style, { position: 'fixed', inset: 0, zIndex: 2147483600, background: `url(data:image/jpeg;base64,${src}) 0 0/100% 100%`, transition: 'opacity .3s' });
        document.documentElement.appendChild(d);
      }, shot);
      await action();
      await h.ready();
      await page.evaluate(() => { const d = document.getElementById('__still'); if (d) { d.style.opacity = '0'; setTimeout(() => d.remove(), 350); } }).catch(() => {});
      await sleep(350);
    },
    // Full-screen cards (notice, title, end) drawn over the already-loaded ERP.
    async showCard(html) {
      await page.evaluate(html => {
        let f = document.getElementById('__card');
        if (!f) { f = document.createElement('iframe'); f.id = '__card'; Object.assign(f.style, { position: 'fixed', inset: 0, width: '100vw', height: '100vh', border: 0, zIndex: 2147483645, background: '#000' }); document.documentElement.appendChild(f); }
        f.srcdoc = html; document.documentElement.classList.add('__carding');
      }, html);
      await page.waitForFunction(() => { const f = document.getElementById('__card'); return f && f.contentDocument && f.contentDocument.readyState === 'complete' && f.contentDocument.body && f.contentDocument.body.children.length; }, null, { timeout: 5000 }).catch(() => {});
      await sleep(150);
    },
    async hideCard() {
      await page.evaluate(() => { const f = document.getElementById('__card'); if (f) f.remove(); document.documentElement.classList.remove('__carding'); });
    },
    loc(sel) { return typeof sel === 'string' ? page.locator(sel).first() : sel; },
    async moveTo(sel, opt = {}) {
      const l = h.loc(sel);
      await l.scrollIntoViewIfNeeded().catch(() => {});
      const b = await l.boundingBox();
      if (!b) throw new Error('not visible: ' + sel);
      const tx = b.x + b.width * (opt.fx ?? 0.5), ty = b.y + b.height * (opt.fy ?? 0.5);
      const n = Math.max(12, Math.round(Math.hypot(tx - cur.x, ty - cur.y) / 25));
      for (let i = 1; i <= n; i++) {
        const t = i / n, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        await page.mouse.move(cur.x + (tx - cur.x) * e, cur.y + (ty - cur.y) * e);
        await sleep(14);
      }
      cur = { x: tx, y: ty };
      return b;
    },
    async click(sel, opt = {}) {
      await h.moveTo(sel, opt); await sleep(250);
      await page.mouse.down(); await sleep(60); await page.mouse.up();
      await sleep(opt.after ?? 700);
    },
    async type(text, delay = 75) { await page.keyboard.type(text, { delay }); },
    async press(key) { await page.keyboard.press(key); },
    // Draws an amber box around an element for `ms` milliseconds.
    async highlight(sel, ms = 2500, pad = 6) {
      const l = h.loc(sel);
      await l.scrollIntoViewIfNeeded().catch(() => {});
      const b = await l.boundingBox(); if (!b) return;
      await page.evaluate(({ b, ms, pad }) => {
        const d = document.createElement('div'); d.className = '__hl';
        Object.assign(d.style, { left: (b.x - pad) + 'px', top: (b.y - pad) + 'px', width: (b.width + 2 * pad) + 'px', height: (b.height + 2 * pad) + 'px' });
        document.documentElement.appendChild(d);
        setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 350); }, ms);
      }, { b, ms, pad });
    },
    // Blur elements (privacy) — CSS selector, or text contained in the element.
    async blur(css) { await page.evaluate(css => document.querySelectorAll(css).forEach(e => e.classList.add('__blur')), css); },
    async blurText(re, closest = '*') {
      await page.evaluate(({ src, closest }) => {
        const rx = new RegExp(src, 'i');
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) if (rx.test(w.currentNode.textContent)) {
          const el = w.currentNode.parentElement.closest(closest) || w.currentNode.parentElement; el.classList.add('__blur');
        }
      }, { src: re.source || re, closest });
    },
    async clickXY(x, y, after = 700) {
      const n = Math.max(12, Math.round(Math.hypot(x - cur.x, y - cur.y) / 25));
      for (let i = 1; i <= n; i++) { const t = i / n, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; await page.mouse.move(cur.x + (x - cur.x) * e, cur.y + (y - cur.y) * e); await sleep(14); }
      cur = { x, y }; await sleep(250); await page.mouse.down(); await sleep(60); await page.mouse.up(); await sleep(after);
    },
    async scroll(dy, steps = 20) { for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await sleep(25); } await sleep(300); },
  };
  return h;
}

// ---------- branding, legal notice, version ----------
const COMPANY = 'Hatim Carbon Co. Pvt. Ltd.';
const FONT = '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf';

// Version metadata shown on the opening and closing cards, in the file name, MP4 tags and releases.json.
function versionMeta(spec, scriptPath) {
  const release = process.argv.includes('--release');
  const now = new Date();
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  let erp = 'unknown', apps = {};
  try {
    const v = JSON.parse(execFileSync('curl', ['-sS', '-m', '20', `${BASE}/api/method/frappe.utils.change_log.get_versions`]).toString()).message;
    apps = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.version])); erp = apps.erpnext || erp;
  } catch (e) { /* recorded as unknown */ }
  let build = 'nogit';
  try {
    const files = [scriptPath, path.join(ROOT, 'engine.js')];
    build = execFileSync('git', ['log', '-1', '--format=%h', '--', ...files], { cwd: ROOT }).toString().trim() || 'new';
    if (execFileSync('git', ['status', '--porcelain', '--', ...files], { cwd: ROOT }).toString().trim()) build += '+local';
  } catch (e) { /* not a git checkout */ }
  const site = /staging/.test(BASE) ? 'staging' : new URL(BASE).host;
  return { code: spec.code, title: spec.title, version: String(spec.version || '1.0'), release, date, iso: now.toISOString(), erp, apps, build, site, year: now.getFullYear() };
}

// releases.json: one entry per released version; a released version can never be overwritten.
const LEDGER = path.join(ROOT, 'releases.json');
function checkRelease(m) {
  if (!m.release) return;
  const ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER)) : [];
  if (ledger.some(r => r.code === m.code && r.version === m.version))
    throw new Error(`${m.code} v${m.version} is already released. Bump "version" in the script to release again.`);
  if (m.build.endsWith('+local') || m.build === 'new') throw new Error('Commit the script and engine before a --release render, so the build id points at the exact code.');
}
function recordRelease(m, file) {
  const ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER)) : [];
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  ledger.push({ code: m.code, title: m.title, version: m.version, released: m.iso, erpnext: m.erp, apps: m.apps, site: m.site, build: m.build, file: path.basename(file), sha256 });
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
}

// ---------- captions ----------
function srtTime(s) {
  const ms = Math.max(0, Math.round(s * 1000)); const hh = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const mm = String(Math.floor(ms / 60000) % 60).padStart(2, '0'); const ss = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss},${String(ms % 1000).padStart(3, '0')}`;
}
function captionChunks(text) {
  // Split into sentences, then into chunks of <= ~72 chars on word boundaries.
  const out = [];
  for (const s of text.match(/[^.!?]+[.!?]*/g) || [text]) {
    let line = '';
    for (const w of s.trim().split(/\s+/)) {
      if ((line + ' ' + w).trim().length > 72) { out.push(line.trim()); line = w; } else line += ' ' + w;
    }
    if (line.trim()) out.push(line.trim());
  }
  return out;
}

// ---------- main ----------
async function main() {
  const scriptPath = path.resolve(process.argv[2]);
  const spec = require(scriptPath);
  if (PROVIDER === 'piper' && !VOICE) throw new Error('Set PIPER_VOICE to a Piper .onnx voice file');
  const cache = path.join(ROOT, '.cache'); fs.mkdirSync(cache, { recursive: true });
  const work = path.join(ROOT, 'out', spec.code); fs.mkdirSync(work, { recursive: true });
  const meta = versionMeta(spec, scriptPath);
  checkRelease(meta);
  console.log(`[${spec.code}] v${meta.version} ${meta.release ? 'RELEASE' : 'draft'} · ERPNext ${meta.erp} (${meta.site}) · build ${meta.build}`);
  // Opening frame: logo, confidentiality, version, legal notice (held long enough to read).
  spec.scenes.unshift({ notice: true, say: 'This training video is confidential, and is for Hatim Carbon employees only.', pad: 3.5 });

  // 1) voice every scene up front, so timings are known before recording
  prevoice(spec.scenes.map(sc => sc.say), cache);
  for (const sc of spec.scenes) Object.assign(sc, { audio: tts(sc.say, cache) });
  console.log(`[${spec.code}] narration: ${spec.scenes.reduce((a, s) => a + s.audio.dur, 0).toFixed(1)} s over ${spec.scenes.length} scenes`);

  // 2) virtual display + browser — one recording per display at a time
  const lock = `/tmp/.X${DISPLAY.slice(1)}-lock`;
  if (fs.existsSync(lock)) {
    const pid = parseInt(fs.readFileSync(lock, 'utf8'), 10);
    let alive = false; try { process.kill(pid, 0); alive = true; } catch (e) { /* stale */ }
    if (alive) throw new Error(`Display ${DISPLAY} is in use by another recording (pid ${pid}). Wait for it, or set REC_DISPLAY=:100.`);
    fs.unlinkSync(lock);
  }
  const xvfb = spawn('Xvfb', [DISPLAY, '-screen', '0', `${W}x${H}x24`, '-nolisten', 'tcp'], { stdio: 'ignore' });
  await sleep(1200);
  const browser = await chromium.launch({
    headless: false, env: { ...process.env, DISPLAY },
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--kiosk', `--window-size=${W},${H}`, '--window-position=0,0', '--force-device-scale-factor=1', '--disable-infobars', '--no-first-run', '--hide-crash-restore-bubble'],
  });
  const context = await browser.newContext({ viewport: null });
  await context.addInitScript(INIT);
  await context.addInitScript(css => {
    const add = () => { if (document.getElementById('__privacy') || !document.head) return; const st = document.createElement('style'); st.id = '__privacy'; st.textContent = css; document.head.appendChild(st); };
    document.addEventListener('DOMContentLoaded', add); setInterval(add, 300);
  }, PRIVACY_CSS + (spec.privacyCSS || ''));
  const page = await context.newPage();
  // True fullscreen: no tabs, no address bar.
  const cdp = await context.newCDPSession(page);
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'fullscreen' } });
  await sleep(800);
  const h = makeHelpers(page);
  if (spec.warmup) await spec.warmup(h); // load caches off-camera
  // Open the ERP where the first live scene starts, off camera, so no loading screen is ever filmed.
  await page.goto(BASE + (spec.start || '/desk'), { waitUntil: 'domcontentloaded' });
  await h.ready();
  // Black pre-roll over it: the cut to the white notice card is the sync mark found in step 5.
  await h.showCard('<html><body style="margin:0;background:#000"></body></html>');
  await sleep(800);

  // 3) start capture
  const raw = path.join(work, 'raw.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', DISPLAY,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '14', '-pix_fmt', 'yuv420p', raw], { stdio: ['pipe', 'ignore', 'inherit'] });
  await sleep(2000);

  // 4) perform scenes; tSync = moment the title card appears (detected later in the video)
  const timeline = [];
  let tSync = null;
  for (const [i, sc] of spec.scenes.entries()) {
    const t0 = Date.now();
    if (i === 0) tSync = t0;
    timeline.push({ start: (t0 - tSync) / 1000, sc });
    const at = async sec => { const w = t0 + sec * 1000 - Date.now(); if (w > 0) await sleep(w); };
    try {
      if (sc.notice) await h.showCard(cards.noticeHTML(meta));
      else if (sc.card) await h.showCard(cards.cardHTML(sc.card, meta));
      else await h.hideCard();
      if (sc.run) await sc.run(h, at);
    } catch (e) {
      console.error(`scene ${i} failed:`, e.message);
      await page.screenshot({ path: path.join(work, `fail-${i}.png`) }).catch(() => {});
      ff.stdin.write('q'); await browser.close().catch(() => {}); xvfb.kill();
      throw e;
    }
    const minEnd = t0 + (sc.audio.dur + (sc.pad ?? 0.6)) * 1000;
    if (Date.now() < minEnd) await sleep(minEnd - Date.now());
    console.log(`  scene ${i + 1}/${spec.scenes.length} done (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  const total = (Date.now() - tSync) / 1000 + 0.8;
  await sleep(1000);
  ff.stdin.write('q'); await new Promise(r => ff.on('close', r));
  await browser.close(); xvfb.kill();

  // 5) find the notice card's first frame (black -> white card is the first scene cut)
  let syncPts = null;
  try {
    const log = execFileSync('bash', ['-c', `ffmpeg -hide_banner -i '${raw}' -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep -m1 -o 'pts_time:[0-9.]*'`]).toString();
    syncPts = parseFloat(log.split(':')[1]);
  } catch (e) { throw new Error('could not find sync frame'); }
  console.log(`[${spec.code}] sync at ${syncPts.toFixed(2)} s, length ${total.toFixed(1)} s`);

  // 6) captions
  let srt = '', n = 1;
  for (const { start, sc } of timeline) {
    const chunks = captionChunks(sc.say), tot = chunks.reduce((a, c) => a + c.length, 0);
    let t = start + 0.05;
    for (const c of chunks) {
      const d = sc.audio.dur * c.length / tot;
      srt += `${n++}\n${srtTime(t)} --> ${srtTime(t + d)}\n${c}\n\n`; t += d;
    }
  }
  const srtPath = path.join(work, `${spec.code}.srt`); fs.writeFileSync(srtPath, srt);

  // 7) final mix
  const outFile = path.join(ROOT, 'out', `${spec.code} v${meta.version} - ${spec.title}${meta.release ? '' : ' (DRAFT)'}.mp4`);
  // Corner watermark over the ERP footage (not over the cards).
  const firstLive = timeline.find(t => !t.sc.card && !t.sc.notice), lastCard = [...timeline].reverse().find(t => t.sc.card);
  const wmFrom = firstLive ? firstLive.start : 0, wmTo = lastCard && lastCard.start > wmFrom ? lastCard.start : total;
  const wmText = `HCC · CONFIDENTIAL · EMPLOYEES ONLY · ${spec.code} v${meta.version}${meta.release ? '' : ' DRAFT'}`.replace(/[:'\\%]/g, '');
  const watermark = `drawtext=fontfile=${FONT}:text='${wmText}':fontsize=17:fontcolor=white@0.95:box=1:boxcolor=0x0f1b2d@0.55:boxborderw=8:x=w-tw-28:y=h-th-104:enable='between(t,${wmFrom.toFixed(2)},${wmTo.toFixed(2)})'`;
  const args = ['-y', '-loglevel', 'error', '-ss', syncPts.toFixed(3), '-t', total.toFixed(3), '-i', raw];
  timeline.forEach(({ sc }) => args.push('-i', sc.audio.file));
  const mixes = timeline.map(({ start }, i) => `[${i + 1}:a]adelay=${Math.round(start * 1000)}:all=1[a${i}]`).join(';');
  const style = "FontName=Inter,FontSize=11,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=14";
  const filter = `${mixes};${timeline.map((_, i) => `[a${i}]`).join('')}amix=inputs=${timeline.length}:normalize=0,apad[aout];` +
    `[0:v]subtitles='${srtPath.replace(/'/g, "\\'")}':force_style='${style}',${watermark}[vout]`;
  args.push('-filter_complex', filter, '-map', '[vout]', '-map', '[aout]', '-t', total.toFixed(3),
    // Compressed for upload to Frappe LMS: 1080p kept for legible ERP text, 15 fps is plenty for
    // screen recordings, mono speech audio. About 1 MB per minute (F1: 3.95 MB -> 2.11 MB, SSIM > 0.99).
    '-r', '15', '-c:v', 'libx264', '-preset', 'slow', '-crf', process.env.VIDEO_CRF || '28', '-tune', 'stillimage', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '48k', '-ac', '1', '-movflags', '+faststart',
    '-metadata', `title=${spec.code} v${meta.version} - ${spec.title}`, '-metadata', `artist=${COMPANY}`,
    '-metadata', `copyright=(c) ${meta.year} ${COMPANY} All rights reserved. Confidential - for Hatim Carbon employees only.`,
    '-metadata', `comment=Version ${meta.version}; ${meta.release ? 'released' : 'DRAFT'} ${meta.date}; ERPNext ${meta.erp} (${meta.site}); build ${meta.build}`,
    '-metadata', `date=${meta.iso.slice(0, 10)}`, outFile);
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  fs.copyFileSync(srtPath, outFile.replace(/\.mp4$/, '.srt'));
  fs.writeFileSync(outFile.replace(/\.mp4$/, '.json'), JSON.stringify({ ...meta, file: path.basename(outFile), voice: voiceId(), scenes: timeline.map(t => ({ start: +t.start.toFixed(2), say: t.sc.say })) }, null, 2));
  if (meta.release) { recordRelease(meta, outFile); console.log(`[${spec.code}] recorded v${meta.version} in releases.json`); }
  console.log(`[${spec.code}] wrote ${outFile}`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { versionMeta };
