// ERP configuration snapshot + diff.
//
//   node drift.js snapshot <ERP_URL> <out.json>      read-only pull of apps, DocTypes, custom fields, desks…
//   node drift.js diff <a.json> <b.json> [report.md]  list every difference
//
// Two uses:
//   1. Change detection — snapshot staging nightly, diff against last night's: anything that
//      touches a DocType or desk a video uses means that video must be re-checked.
//   2. Staging vs live — snapshot both and diff, to find apps/settings that exist on only one.
//
// Requests go through curl so the cloud session's proxy can add credentials. Elsewhere,
// set ERP_AUTH="token <api_key>:<api_secret>" for a read-only user.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');

function get(base, path, params = {}) {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))}`).join('&');
  const args = ['-sS', '-m', '60', `${base}${path}${qs ? '?' + qs : ''}`];
  if (process.env.ERP_AUTH) args.push('-H', `Authorization: ${process.env.ERP_AUTH}`);
  const body = execFileSync('curl', args, { maxBuffer: 256 << 20 }).toString();
  try { return JSON.parse(body); } catch { return { error: body.slice(0, 200) }; }
}
const list = (base, doctype, fields, filters = []) => {
  const r = get(base, `/api/resource/${encodeURIComponent(doctype)}`, { fields, filters, limit_page_length: 0, order_by: 'name asc' });
  return r.data || { error: r.exc_type || r.error || 'no access' };
};

// What is compared. Business documents are never read — only configuration.
const SOURCES = {
  apps: b => { const r = get(b, '/api/method/frappe.utils.change_log.get_versions'); return r.message ? Object.fromEntries(Object.entries(r.message).map(([k, v]) => [k, v.version])) : { error: 'no access' }; },
  modules: b => list(b, 'Module Def', ['name', 'app_name']),
  doctypes: b => list(b, 'DocType', ['name', 'module', 'custom', 'istable', 'is_submittable']),
  customFields: b => list(b, 'Custom Field', ['name', 'dt', 'fieldname', 'label', 'fieldtype', 'insert_after', 'reqd', 'hidden', 'options']),
  propertySetters: b => list(b, 'Property Setter', ['name', 'doc_type', 'field_name', 'property', 'value']),
  workspaces: b => list(b, 'Workspace', ['name', 'module', 'public', 'is_hidden']),
  reports: b => list(b, 'Report', ['name', 'ref_doctype', 'report_type', 'disabled']),
  printFormats: b => list(b, 'Print Format', ['name', 'doc_type', 'disabled']),
  pages: b => list(b, 'Page', ['name', 'module']),
  workflows: b => list(b, 'Workflow', ['name', 'document_type', 'is_active']),
  roles: b => list(b, 'Role', ['name', 'disabled']),
  emailAccounts: b => list(b, 'Email Account', ['name', 'enable_outgoing', 'enable_incoming']),
  notifications: b => list(b, 'Notification', ['name', 'document_type', 'event', 'enabled']),
  serverScripts: b => list(b, 'Server Script', ['name', 'reference_doctype', 'script_type', 'disabled']),
  clientScripts: b => list(b, 'Client Script', ['name', 'dt', 'enabled']),
  dispatchEmailSettings: b => { const r = get(b, '/api/resource/Dispatch%20Email%20Settings/Dispatch%20Email%20Settings'); if (!r.data) return { error: 'no access' }; const { modified, creation, owner, modified_by, ...rest } = r.data; return rest; },
};

function snapshot(base, out) {
  const snap = { base, taken: new Date().toISOString() };
  for (const [k, fn] of Object.entries(SOURCES)) { snap[k] = fn(base); process.stderr.write(`${k}: ${Array.isArray(snap[k]) ? snap[k].length + ' rows' : snap[k].error ? 'ERROR ' + snap[k].error : 'ok'}\n`); }
  fs.writeFileSync(out, JSON.stringify(snap, null, 1));
}

function keyed(v) {
  if (Array.isArray(v)) return Object.fromEntries(v.map(r => [r.name, r]));
  return v;
}
function diff(aFile, bFile, outFile) {
  const A = JSON.parse(fs.readFileSync(aFile)), B = JSON.parse(fs.readFileSync(bFile));
  const lines = [`# ERP drift: ${A.base} → ${B.base}`, '', `A taken ${A.taken} · B taken ${B.taken}`, ''];
  let total = 0, skipped = 0;
  for (const k of Object.keys(SOURCES)) {
    const a = keyed(A[k]), b = keyed(B[k]);
    if (a?.error || b?.error) { skipped++; lines.push(`## ${k}`, '', `Not compared: ${a?.error ? 'A ' + a.error : ''} ${b?.error ? 'B ' + b.error : ''}`.trim(), ''); continue; }
    const onlyA = Object.keys(a).filter(x => !(x in b)), onlyB = Object.keys(b).filter(x => !(x in a));
    const changed = Object.keys(a).filter(x => x in b && JSON.stringify(a[x]) !== JSON.stringify(b[x]));
    if (!onlyA.length && !onlyB.length && !changed.length) continue;
    total += onlyA.length + onlyB.length + changed.length;
    lines.push(`## ${k}`, '');
    onlyA.forEach(x => lines.push(`- only in A: **${x}**`));
    onlyB.forEach(x => lines.push(`- only in B: **${x}**`));
    changed.forEach(x => lines.push(`- changed: **${x}** — A \`${JSON.stringify(a[x])}\` · B \`${JSON.stringify(b[x])}\``));
    lines.push('');
  }
  const head = skipped === Object.keys(SOURCES).length ? '**Nothing compared: no read access to one side.**'
    : `**${total} differences**${skipped ? ` (${skipped} of ${Object.keys(SOURCES).length} sections not compared)` : ''}.`;
  lines.splice(4, 0, head, '');
  const md = lines.join('\n');
  if (outFile) fs.writeFileSync(outFile, md); else process.stdout.write(md + '\n');
  return total;
}

const [cmd, x, y, z] = process.argv.slice(2);
if (cmd === 'snapshot' && x && y) snapshot(x.replace(/\/$/, ''), y);
else if (cmd === 'diff' && x && y) process.exitCode = diff(x, y, z) ? 1 : 0; // 1 = differences found
else { console.error('usage: node drift.js snapshot <ERP_URL> <out.json> | diff <a.json> <b.json> [report.md]'); process.exit(2); }
