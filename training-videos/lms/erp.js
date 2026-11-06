// Minimal Frappe REST client for the training-video LMS scripts.
// Requests go through curl so the cloud session's proxy can add the ERP credentials.
// Elsewhere set ERP_AUTH="token <api_key>:<api_secret>" (a user with LMS Course Creator rights).
'use strict';
const { execFileSync } = require('child_process');

const BASE = (process.env.ERP_URL || 'https://erpstaging.hatimcarbon.com').replace(/\/$/, '');

function curl(args) {
  const all = ['-sS', '-m', '300', ...args];
  if (process.env.ERP_AUTH) all.push('-H', `Authorization: ${process.env.ERP_AUTH}`);
  const out = execFileSync('curl', all, { maxBuffer: 64 << 20 }).toString();
  let j; try { j = JSON.parse(out); } catch { throw new Error('Non-JSON response: ' + out.slice(0, 300)); }
  if (j.exc_type || j.exception) throw new Error(`${j.exc_type || 'Error'}: ${String(j.exception || j._server_messages || '').slice(0, 400)}`);
  return j;
}
const qs = o => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))}`).join('&');
const res = d => '/api/resource/' + encodeURIComponent(d);

const erp = {
  BASE,
  get: (doctype, name) => curl([`${BASE}${res(doctype)}/${encodeURIComponent(name)}`]).data,
  list: (doctype, filters = [], fields = ['name']) => curl([`${BASE}${res(doctype)}?${qs({ filters, fields, limit_page_length: 0 })}`]).data,
  insert: (doctype, doc) => curl(['-X', 'POST', `${BASE}${res(doctype)}`, '-H', 'Content-Type: application/json', '-d', JSON.stringify(doc)]).data,
  update: (doctype, name, doc) => curl(['-X', 'PUT', `${BASE}${res(doctype)}/${encodeURIComponent(name)}`, '-H', 'Content-Type: application/json', '-d', JSON.stringify(doc)]).data,
  remove: (doctype, name) => curl(['-X', 'DELETE', `${BASE}${res(doctype)}/${encodeURIComponent(name)}`]),
  call: (method, args = {}) => curl(['-X', 'POST', `${BASE}/api/method/${method}`, '-H', 'Content-Type: application/json', '-d', JSON.stringify(args)]).message,
  me: () => curl([`${BASE}/api/method/frappe.auth.get_logged_user`]).message,
  doctypeExists: d => { try { curl([`${BASE}${res('DocType')}/${encodeURIComponent(d)}`]); return true; } catch { return false; } },
  // Upload a file as PRIVATE (login + permission required to download), attached to a document.
  upload(file, { doctype, docname, fieldname }) {
    // curl -F treats ',' and ';' in a file path as option separators, so upload a copy with a plain
    // name and send the real name separately.
    const os = require('os'), fs = require('fs'), path = require('path');
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'up-')), 'video' + path.extname(file));
    fs.copyFileSync(file, tmp);
    const args = ['-X', 'POST', `${BASE}/api/method/upload_file`, '-F', `file=@${tmp};filename=${path.basename(file).replace(/[;,"]/g, '')}`, '-F', 'is_private=1', '-F', `doctype=${doctype}`, '-F', `docname=${docname}`];
    if (fieldname) args.push('-F', `fieldname=${fieldname}`);
    try { return curl(args).message; } finally { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); }
  },
};
module.exports = erp;
