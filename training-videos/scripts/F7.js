// F7 · Bulk upload with Data Import  (Foundations, everyone, ~3 min)
// Imports selling prices for two DEMO items (assets/DEMO item prices.csv) up to the preview, and
// stops at Start Import: staging's scheduler is off, and the import itself is not run (agreed).
// Changes on staging: one Data Import record and its uploaded file, both deleted after recording.
// The template download is answered with "no content", so no file is saved and no browser bar shows.
const path = require('path');
const FILE = path.join(__dirname, '..', 'assets', 'DEMO item prices.csv');

module.exports = {
  code: 'F7',
  title: 'Bulk upload with Data Import',
  version: '1.1',
  start: '/desk/data-import',
  async warmup(h) {
    await h.go('/desk/data-import'); await removeDemo(h);
    await h.page.evaluate(() => frappe.model.with_doctype('Data Import')); // load the form's metadata off-camera
  },
  async cleanup(h) {
    await h.page.evaluate(() => document.querySelectorAll('.modal.show .btn-modal-close').forEach(b => b.click())).catch(() => {});
    await removeDemo(h);
  },
  scenes: [
    {
      card: { kicker: 'F7 · Foundations', title: 'Bulk upload with Data Import', sub: 'Add or update many records at once, from a spreadsheet · 3 minutes' },
      say: 'When you need to add or change many records at once, such as new prices for a list of items, use Data Import instead of typing them one by one.',
    },
    {
      say: 'Search for Data Import and open it. Each import you run is kept here, with its result. Click Add Data Import to start a new one.',
      async run(h, at) {
        const add = h.page.locator('.page-actions button.btn-primary:visible', { hasText: 'Add Data Import' }).first();
        await at(2.6); await h.highlight(h.page.locator('.frappe-list:visible').first(), 2400, 4);
        await at(5.4); await h.moveTo(add);
        await at(6.6); await h.transition(() => h.click(add, { after: 200 }));
      },
    },
    {
      say: 'Choose what you are importing, here Item Price. Then choose the import type: Insert New Records to add new ones, or Update Existing Records to change records already in the system. Save.',
      async run(h, at) {
        const dt = h.page.locator('.frappe-control[data-fieldname=reference_doctype] input:visible').first();
        await at(1.6); await h.click(dt, { after: 200 }); await h.press('Control+a'); await h.press('Backspace'); await h.type('Item Price', 80); // the field remembers the last type used
        const opt = h.page.locator('.awesomplete ul[role=listbox] [role=option]:visible', { hasText: 'Item Price' }).first();
        await opt.waitFor({ timeout: 8000 }); await h.moveTo(opt); await h.sleep(250); await h.click(opt, { after: 500 });
        const type = h.page.locator('.frappe-control[data-fieldname=import_type] select').first();
        await at(5.6); await h.moveTo(type); await h.sleep(300); await type.selectOption('Insert New Records');
        await at(7.6); await h.highlight(h.page.locator('.frappe-control[data-fieldname=import_type]').first(), 3400, 6);
        const save = h.page.locator('.page-actions button:visible', { hasText: 'Save' }).first();
        await at(12.2); await h.click(save, { after: 300 });
        await h.page.waitForFunction(() => !cur_frm.is_new(), null, { timeout: 10000 }); await h.ready();
      },
    },
    {
      say: 'Click Download Template. Pick Excel or C S V, keep Blank Template, and tick the columns you need. Select Mandatory ticks the ones that must be filled in. Then click Export.',
      async run(h, at) {
        const btn = h.page.locator('.frappe-control[data-fieldname=download_template] button:visible').first();
        await at(0.8); await h.click(btn, { after: 300 });
        const m = h.page.locator('.modal.show:visible').last();
        await m.locator('[data-fieldname=file_type]').first().waitFor({ timeout: 8000 }); await h.sleep(400);
        await at(2.8); await h.highlight(m.locator('[data-fieldname=file_type]').first(), 1800, 4);
        await at(4.4); await h.highlight(m.locator('[data-fieldname=export_records]').first(), 1800, 4);
        const mand = m.locator('button:visible', { hasText: 'Select Mandatory' }).first();
        await at(7.0); await h.click(mand, { after: 300 });
        await at(9.6); await h.highlight(mand, 1800, 4);
        // The export is a form POST; answer it with "no content" so nothing downloads on camera.
        const stub = r => (r.request().method() === 'POST' ? r.fulfill({ status: 204, body: '' }) : r.continue());
        const match = u => /download_template/.test(u) || new URL(u).pathname === '/';
        await h.page.route(match, stub);
        const exp = m.locator('.btn-primary:visible', { hasText: 'Export' }).first();
        await at(12.4); await h.click(exp, { after: 600 });
        await h.page.waitForFunction(() => !document.querySelector('.modal.show'), null, { timeout: 1200 }).catch(() => {});
        await h.page.unroute(match, stub);
        // The dialog stays open after the export; close it the way a user would.
        const x = h.page.locator('.modal.show .btn-modal-close:visible').last();
        if (await x.count()) await h.click(x, { after: 400 });
      },
    },
    {
      say: 'Open the template in Excel and fill it in, one row for each record. Keep the column headings exactly as they are. Here, new prices for two items.',
      async run(h, at) {
        await at(0.6); await sheet(h, 7600);
      },
    },
    {
      say: 'Back in the E R P, click Attach, choose My Device, and pick your file. Then click Upload.',
      async run(h, at) {
        const attach = h.page.locator('.frappe-control[data-fieldname=import_file] button:visible', { hasText: 'Attach' }).first();
        await at(1.8); await h.click(attach, { after: 400 });
        const m = h.page.locator('.modal.show:visible').last();
        const dev = m.locator('button.btn-file-upload:visible', { hasText: 'My Device' }).first();
        await dev.waitFor({ timeout: 8000 });
        await at(3.2); await h.moveTo(dev); await h.sleep(200);
        // Catch the browser's file picker so no system window opens; hand it the demo file.
        const fc = h.page.waitForEvent('filechooser', { timeout: 8000 });
        await h.click(dev, { after: 200 }); await (await fc).setFiles(FILE);
        await h.sleep(900);
        const up = m.locator('.btn-primary:visible', { hasText: 'Upload' }).first();
        await at(6.2); await h.click(up, { after: 300 });
        await h.page.waitForFunction(() => !!cur_frm.doc.import_file, null, { timeout: 15000 }); await h.ready();
      },
    },
    {
      say: 'The preview shows every row, the way it will be imported. Check that each column is matched to the right field. If one is not, click Map Columns and fix it.',
      async run(h, at) {
        const prev = h.page.locator('.frappe-control[data-fieldname=import_preview]:visible').first();
        await at(0.4); await prev.evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'center' })).catch(() => {}); await h.sleep(800);
        await at(1.6); await h.highlight(prev, 3600, 6);
        const map = h.page.locator('button:visible', { hasText: 'Map Columns' }).first();
        await at(7.4); if (await map.count()) { await h.moveTo(map); await h.highlight(map, 2200, 4); }
      },
    },
    {
      say: 'When everything looks right, click Start Import. The rows are imported in the background, and the log shows how many worked. If a row fails, the log says why, so you can fix it in the file and import again.',
      async run(h, at) {
        await h.scroll(-800);
        const start = h.page.locator('.page-actions button:visible', { hasText: 'Start Import' }).first();
        await at(1.6); await h.moveTo(start); await h.highlight(start, 3000, 6);
        await at(9.0); await h.tip('Try a small file first, and check a few of the new records before you import hundreds.', 6000);
      },
    },
    {
      card: { code: 'F8', kicker: 'Next · F8', title: 'Raise an ERP Ticket when something is wrong', sub: 'You have finished F7. All training videos are in Learning.' },
      say: 'That is Data Import: download the template, fill it in, upload, check, and import. Next, video F8 shows how to raise an E R P ticket when something is wrong.',
    },
  ],
};

// A simple spreadsheet drawn over the screen, showing the filled-in template (the CSV in assets/).
async function sheet(h, ms) {
  const rows = require('fs').readFileSync(FILE, 'utf8').trim().split('\n').map(r => r.split(','));
  await h.page.evaluate(({ rows, ms }) => {
    const d = document.createElement('div'); d.id = '__sheet';
    Object.assign(d.style, { position: 'fixed', inset: '0', zIndex: 2147483640, background: 'rgba(28,28,26,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: '0', transition: 'opacity .35s', pointerEvents: 'none' });
    const box = document.createElement('div');
    Object.assign(box.style, { background: '#fff', borderRadius: '10px', boxShadow: '0 12px 40px rgba(0,0,0,.35)', overflow: 'hidden', font: "400 26px/1.4 Inter, 'DejaVu Sans', sans-serif", color: '#1C1C1A' });
    const bar = document.createElement('div'); bar.textContent = 'DEMO item prices.csv';
    Object.assign(bar.style, { background: '#456B40', color: '#fff', padding: '10px 20px', font: "600 22px Inter, sans-serif" });
    const t = document.createElement('table'); t.style.borderCollapse = 'collapse';
    rows.forEach((r, i) => { const tr = t.insertRow(); r.forEach(c => { const td = tr.insertCell(); td.textContent = c;
      Object.assign(td.style, { border: '1px solid #D9D6CC', padding: '12px 28px', minWidth: '200px', background: i ? '#fff' : '#F5F4EF', fontWeight: i ? '400' : '600' }); }); });
    box.append(bar, t); d.append(box); document.documentElement.appendChild(d);
    requestAnimationFrame(() => { d.style.opacity = '1'; });
    setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 400); }, ms);
  }, { rows, ms });
  await h.sleep(ms + 450);
}

// Delete Data Import records for Item Price that use the demo file, and the uploaded files.
async function removeDemo(h) {
  await h.page.evaluate(async () => {
    const del = (dt, n) => frappe.call({ method: 'frappe.client.delete', args: { doctype: dt, name: n } }).catch(() => {});
    const imps = await frappe.db.get_list('Data Import', { filters: { reference_doctype: 'Item Price', owner: frappe.session.user, creation: ['>=', frappe.datetime.get_today()] }, fields: ['name', 'import_file'], limit: 50 });
    for (const d of imps) {
      if (d.import_file && !/DEMO item prices/.test(d.import_file)) continue; // keep real imports
      for (const f of await frappe.db.get_list('File', { filters: { attached_to_doctype: 'Data Import', attached_to_name: d.name }, pluck: 'name' })) await del('File', f);
      await del('Data Import', d.name);
    }
    for (const f of await frappe.db.get_list('File', { filters: { file_name: ['like', 'DEMO item prices%'] }, pluck: 'name' })) await del('File', f);
  }).catch(e => console.warn('  ! F7 cleanup:', e.message));
}
