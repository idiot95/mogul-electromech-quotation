// Opening notice, title and end cards for the training videos (1920x1080 HTML frames).
//
// Three design directions; engine.js uses CARD_THEME. Chosen house style: paper (6 Nov 2026).
//   paper  — light, editorial: warm paper, charcoal type, green accents
//   green  — full-bleed brand green, white logo and type
//   split  — charcoal brand panel on the left, white content panel on the right
//
// Values are provisional: Hatim Carbon has no design system yet. Only the logo
// green (#456B40) and the logo charcoal come from the brand; everything else
// (paper, deep green, greys, sizes) was chosen for these cards and should be
// reconciled if a design system is created.
'use strict';
const fs = require('fs');
const path = require('path');

const img = f => 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'brand', f)).toString('base64');
const LOGO = img('hcc-logo.png'), LOGO_WHITE = img('hcc-logo-white.png');
const COMPANY = 'Hatim Carbon Co. Pvt. Ltd.';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Brand + provisional tokens
const T = {
  green: '#456B40', deep: '#2E4A2B', deeper: '#243B22', charcoal: '#262626', ink: '#1C1C1A',
  paper: '#F5F4EF', line: '#D9D6CC', muted: '#6B6B66', amber: '#B26B00',
};
const LOCK = c => `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>`;

const LEGAL = m => [
  `This video contains confidential and proprietary information of ${COMPANY} It is for the internal training of authorised employees only. Do not copy, record, share, upload or distribute it, in whole or in part, outside the company without written permission.`,
  'Screens were recorded on a test system. Customer, supplier, price and personal data are blurred or are demonstration data. Procedures may change after the release date: always use the latest version on the company Wiki. The narration is computer-generated.',
  `© ${m.year} ${COMPANY} All rights reserved. ERPNext and Frappe are trademarks of Frappe Technologies Pvt. Ltd. Other names belong to their respective owners.`,
];
const META = m => [
  ['Version', m.version],
  [m.release ? 'Released' : 'Draft of', m.date],
  ['Recorded on', `ERPNext ${m.erp} · ${m.site}`],
  ['Build', m.build],
];
const footerLine = m => `Confidential · For Hatim Carbon employees only · © ${m.year} ${COMPANY} · ${m.code} v${m.version} · ${m.release ? 'Released ' + m.date : 'Draft ' + m.date}`;

const BASE_CSS = `*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;font-family:Inter,'DejaVu Sans',sans-serif;-webkit-font-smoothing:antialiased}#__cur{display:none!important}`;
const page = (css, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`;
// Draft marker: a quiet tag, never on a released video.
const draftTag = (m, color) => m.release ? '' : `<span class="draft" style="border:2px solid ${color};color:${color}">Draft · not for distribution</span>`;

// ---------- paper ----------
const paper = {
  notice(m) {
    return page(`
      body{background:${T.paper};color:${T.ink}}
      .hd{position:absolute;left:120px;right:120px;top:84px;display:flex;justify-content:space-between;align-items:center}
      .hd img{height:132px}
      .conf{text-align:right}.conf .l{display:flex;align-items:center;gap:12px;justify-content:flex-end;font-weight:700;font-size:30px;letter-spacing:6px;color:${T.charcoal}}
      .conf .s{margin-top:8px;font-size:22px;color:${T.muted}}
      .rule{position:absolute;left:120px;right:120px;top:262px;height:3px;background:${T.green}}
      .k{position:absolute;left:120px;top:330px;font-size:24px;font-weight:600;letter-spacing:4px;color:${T.green};text-transform:uppercase}
      h1{position:absolute;left:120px;right:120px;top:370px;margin:0;font-size:76px;line-height:1.08;font-weight:700;letter-spacing:-1px}
      .meta{position:absolute;left:120px;top:540px;display:flex;gap:72px}
      .meta b{display:block;font-size:17px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:${T.muted};margin-bottom:8px}
      .meta span{font-size:28px;font-weight:500}
      .draft{position:absolute;left:120px;top:650px;font-size:20px;font-weight:600;letter-spacing:1px;padding:6px 14px;border-radius:6px}
      .legal{position:absolute;left:120px;right:120px;bottom:150px;display:grid;grid-template-columns:repeat(3,1fr);gap:48px;border-top:1px solid ${T.line};padding-top:28px}
      .legal p{margin:0;font-size:17px;line-height:1.6;color:${T.muted}}`,
      `<div class="hd"><img src="${LOGO}"><div class="conf"><div class="l">${LOCK(T.charcoal)}CONFIDENTIAL</div><div class="s">For Hatim Carbon employees only</div></div></div>
      <div class="rule"></div>
      <div class="k">${esc(m.code)} · Training video</div><h1>${esc(m.title)}</h1>
      <div class="meta">${META(m).map(([k, v]) => `<div><b>${k}</b><span>${esc(v)}</span></div>`).join('')}</div>
      ${draftTag(m, T.amber)}
      <div class="legal">${LEGAL(m).map(p => `<p>${esc(p)}</p>`).join('')}</div>`);
  },
  card(c, m) {
    return page(`
      body{background:${T.paper};color:${T.ink}}
      img{position:absolute;left:120px;top:84px;height:96px}
      .code{position:absolute;left:112px;top:300px;font-size:300px;font-weight:800;line-height:1;color:${T.green};letter-spacing:-8px}
      .code{bottom:auto}
      .blk{position:absolute;left:120px;right:200px;bottom:190px}
      .k{font-size:26px;font-weight:600;letter-spacing:4px;color:${T.green};text-transform:uppercase}
      h1{margin:12px 0 0;font-size:72px;line-height:1.08;font-weight:700;letter-spacing:-1px}
      .sub{margin-top:22px;font-size:30px;color:${T.muted}}
      .f{position:absolute;left:120px;right:120px;top:930px;padding-top:18px;border-top:1px solid ${T.line};font-size:18px;color:${T.muted}}`,
      `<img src="${LOGO}"><div class="code">${esc(c.code || m.code)}</div><div class="blk"><div class="k">${esc(c.kicker)}</div><h1>${esc(c.title)}</h1><div class="sub">${esc(c.sub)}</div></div><div class="f">${esc(footerLine(m))}</div>`);
  },
};

// ---------- green ----------
const green = {
  notice(m) {
    return page(`
      body{background:${T.deep};color:#fff}
      .hd{position:absolute;left:120px;right:120px;top:84px;display:flex;justify-content:space-between;align-items:flex-start}
      .hd img{height:150px}
      .conf{display:flex;align-items:center;gap:14px;border:2px solid rgba(255,255,255,.85);border-radius:999px;padding:14px 28px;font-weight:700;font-size:24px;letter-spacing:3px}
      .conf small{display:block;font-weight:500;font-size:18px;letter-spacing:.5px;opacity:.8;margin-top:2px}
      .k{position:absolute;left:120px;top:330px;font-size:24px;font-weight:600;letter-spacing:4px;color:#B9D3B1;text-transform:uppercase}
      h1{position:absolute;left:120px;right:120px;top:370px;margin:0;font-size:80px;line-height:1.06;font-weight:700;letter-spacing:-1px}
      .meta{position:absolute;left:120px;right:120px;top:540px;display:grid;grid-template-columns:repeat(4,auto);justify-content:start;border-top:1px solid rgba(255,255,255,.25);border-bottom:1px solid rgba(255,255,255,.25)}
      .meta div{padding:22px 56px 22px 0;margin-right:40px}
      .meta b{display:block;font-size:16px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:#B9D3B1;margin-bottom:8px}
      .meta span{font-size:28px;font-weight:500}
      .draft{position:absolute;left:120px;top:690px;font-size:20px;font-weight:600;letter-spacing:1px;padding:6px 14px;border-radius:6px}
      .legal{position:absolute;left:120px;right:120px;bottom:150px;display:grid;grid-template-columns:repeat(3,1fr);gap:48px}
      .legal p{margin:0;font-size:17px;line-height:1.6;color:rgba(255,255,255,.72)}`,
      `<div class="hd"><img src="${LOGO_WHITE}"><div class="conf">${LOCK('#fff')}<div>CONFIDENTIAL<small>For Hatim Carbon employees only</small></div></div></div>
      <div class="k">${esc(m.code)} · Training video</div><h1>${esc(m.title)}</h1>
      <div class="meta">${META(m).map(([k, v]) => `<div><b>${k}</b><span>${esc(v)}</span></div>`).join('')}</div>
      ${draftTag(m, '#F5C26B')}
      <div class="legal">${LEGAL(m).map(p => `<p>${esc(p)}</p>`).join('')}</div>`);
  },
  card(c, m) {
    return page(`
      body{background:${T.deep};color:#fff}
      img{position:absolute;left:120px;top:84px;height:110px}
      .blk{position:absolute;left:120px;right:200px;bottom:190px}
      .k{font-size:24px;font-weight:600;letter-spacing:4px;color:#B9D3B1;text-transform:uppercase}
      h1{margin:14px 0 0;font-size:96px;line-height:1.04;font-weight:700;letter-spacing:-1.5px}
      .sub{margin-top:26px;font-size:32px;color:rgba(255,255,255,.75)}
      .f{position:absolute;left:120px;right:120px;top:930px;padding-top:18px;border-top:1px solid rgba(255,255,255,.22);font-size:18px;color:rgba(255,255,255,.6)}`,
      `<img src="${LOGO_WHITE}"><div class="blk"><div class="k">${esc(c.kicker)}</div><h1>${esc(c.title)}</h1><div class="sub">${esc(c.sub)}</div></div><div class="f">${esc(footerLine(m))}</div>`);
  },
};

// ---------- split ----------
const split = {
  notice(m) {
    return page(`
      body{background:#fff;color:${T.ink}}
      .pn{position:absolute;left:0;top:0;bottom:0;width:640px;background:${T.charcoal};color:#fff}
      .pn::after{content:'';position:absolute;right:0;top:0;bottom:0;width:14px;background:${T.green}}
      .pn img{position:absolute;left:100px;top:100px;width:420px}
      .pn .code{position:absolute;left:96px;bottom:84px;font-size:200px;font-weight:800;line-height:1;letter-spacing:-6px}
      .rt{position:absolute;left:760px;right:110px;top:100px}
      .conf{display:flex;align-items:center;gap:12px;font-weight:700;font-size:26px;letter-spacing:5px;color:${T.green}}
      .conf span{font-weight:500;letter-spacing:.5px;color:${T.muted};font-size:22px;margin-left:6px}
      h1{margin:44px 0 0;font-size:68px;line-height:1.08;font-weight:700;letter-spacing:-1px}
      .meta{margin-top:44px;display:grid;grid-template-columns:1fr 1fr;gap:26px 48px;max-width:900px}
      .meta b{display:block;font-size:16px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:${T.muted};margin-bottom:6px}
      .meta span{font-size:28px;font-weight:500}
      .draft{display:inline-block;margin-top:30px;font-size:20px;font-weight:600;letter-spacing:1px;padding:6px 14px;border-radius:6px}
      .legal{position:absolute;left:760px;right:110px;bottom:150px;border-top:1px solid ${T.line};padding-top:24px}
      .legal p{margin:0 0 12px;font-size:17px;line-height:1.55;color:${T.muted}}`,
      `<div class="pn"><img src="${LOGO_WHITE}"><div class="code">${esc(m.code)}</div></div>
      <div class="rt"><div class="conf">${LOCK(T.green)}CONFIDENTIAL<span>For Hatim Carbon employees only</span></div>
      <h1>${esc(m.title)}</h1>
      <div class="meta">${META(m).map(([k, v]) => `<div><b>${k}</b><span>${esc(v)}</span></div>`).join('')}</div>
      ${draftTag(m, T.amber)}</div>
      <div class="legal">${LEGAL(m).map(p => `<p>${esc(p)}</p>`).join('')}</div>`);
  },
  card(c, m) {
    return page(`
      body{background:#fff;color:${T.ink}}
      .pn{position:absolute;left:0;top:0;bottom:0;width:640px;background:${T.charcoal};color:#fff}
      .pn::after{content:'';position:absolute;right:0;top:0;bottom:0;width:14px;background:${T.green}}
      .pn img{position:absolute;left:100px;top:100px;width:420px}
      .pn .code{position:absolute;left:96px;bottom:150px;font-size:200px;font-weight:800;line-height:1;letter-spacing:-6px}
      .blk{position:absolute;left:760px;right:110px;bottom:190px}
      .k{font-size:26px;font-weight:600;letter-spacing:4px;color:${T.green};text-transform:uppercase}
      h1{margin:14px 0 0;font-size:84px;line-height:1.06;font-weight:700;letter-spacing:-1.5px}
      .sub{margin-top:24px;font-size:30px;color:${T.muted}}
      .f{position:absolute;left:760px;right:110px;top:930px;padding-top:18px;border-top:1px solid ${T.line};font-size:17px;color:${T.muted}}`,
      `<div class="pn"><img src="${LOGO_WHITE}"><div class="code">${esc(c.code || m.code)}</div></div><div class="blk"><div class="k">${esc(c.kicker)}</div><h1>${esc(c.title)}</h1><div class="sub">${esc(c.sub)}</div></div><div class="f">${esc(footerLine(m))}</div>`);
  },
};

const THEMES = { paper, green, split };
const theme = () => THEMES[process.env.CARD_THEME || 'paper'] || paper;
module.exports = {
  THEMES, COMPANY, footerLine,
  noticeHTML: m => theme().notice(m),
  cardHTML: (c, m) => theme().card(c, m),
};
