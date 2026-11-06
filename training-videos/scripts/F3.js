// F3 · Create, save, submit, cancel and amend a document  (Foundations, everyone, ~3 min)
// Uses a Quotation, which never posts to accounts or stock. Changes on staging: one quotation for
// DEMO-Customer India (submitted, then cancelled) and its amended draft; both deleted after recording.
// Needs the demo masters from demo-data.js.
const CUSTOMER = 'DEMO-Customer India', ITEM = 'DEMO-Carbon Brush';

module.exports = {
  code: 'F3',
  title: 'Create, save, submit, cancel and amend a document',
  version: '1.0',
  start: '/desk/quotation',
  keepSettings: ['Quotation'],
  async warmup(h) { await h.go('/desk/quotation'); await removeDemo(h); },
  async cleanup(h) { await removeDemo(h); },
  privacyCSS: '',
  scenes: [
    {
      card: { kicker: 'F3 · Foundations', title: 'Create, save, submit, cancel and amend a document', sub: 'The life of a document, shown on a quotation · 3 minutes' },
      say: 'Every document in the E R P follows the same steps: create, save, submit, and if needed, cancel and amend. We will walk through them on a quotation.',
    },
    {
      say: 'Start from the list. Click the Add button at the top right to create a new document.',
      async run(h, at) {
        const add = h.page.locator('.page-actions button.btn-primary:visible').first();
        await at(1.6); await h.moveTo(add); await h.highlight(add, 1600, 4);
        await at(3.6); await h.transition(() => h.click(add, { after: 200 }));
      },
    },
    {
      say: 'A new form opens. Fields marked with a red star must be filled in. Choose the customer: start typing, then pick from the list.',
      async run(h, at) {
        const cust = h.page.locator('.frappe-control[data-fieldname=party_name] input:visible').first();
        await at(3.0); await h.highlight(cust.locator('xpath=ancestor::div[contains(@class,"frappe-control")][1]'), 2400, 6);
        await at(5.8); await h.click(cust, { after: 300 }); await h.type('DEMO-Cust', 90);
        await pickOption(h, CUSTOMER);
      },
    },
    {
      say: 'Next, add what you are quoting for. In the items table, choose the item and enter the quantity. The price fills in from the price list, and the total updates.',
      async run(h, at) {
        const row = h.page.locator('.frappe-control[data-fieldname=items] .grid-body .grid-row:visible').first();
        await h.moveTo(row); await h.scroll(260);
        await at(3.4); await h.click(row.locator('[data-fieldname=item_code]').first(), { after: 300 });
        // The cell turns into an input after the click; type only once that input has focus.
        await h.page.waitForFunction(() => document.activeElement?.getAttribute('data-fieldname') === 'item_code', null, { timeout: 5000 });
        await h.sleep(250); await h.type('DEMO-Carbon', 90);
        await pickOption(h, ITEM);
        await at(7.2); await h.click(row.locator('[data-fieldname=qty]').first(), { after: 400 });
        const qty = row.locator('input[data-fieldname=qty]:visible').first();
        await h.click(qty, { after: 150 }); await h.press('Control+a'); await h.type('100', 120); await h.press('Tab');
        await h.page.waitForFunction(() => cur_frm.doc.grand_total > 0, null, { timeout: 8000 });
        await h.sleep(500); await h.highlight(h.page.locator('.frappe-control[data-fieldname=total]:visible, .frappe-control[data-fieldname=grand_total]:visible').first(), 2200, 6);
      },
    },
    {
      say: 'Click Save, or press Control and S. The document is now a draft. You can still change anything in it.',
      async run(h, at) {
        await h.scroll(-600);
        const save = h.page.locator('.page-actions button.btn-primary:visible', { hasText: 'Save' }).first();
        await at(0.8); await h.moveTo(save);
        await at(1.6); await h.click(save, { after: 300 });
        await h.page.waitForFunction(() => cur_frm.doc.__islocal !== 1 && !cur_frm.is_dirty(), null, { timeout: 10000 });
        await h.ready();
        await at(4.0); await h.highlight(h.page.locator('.page-head .indicator-pill:visible').first(), 2400, 4);
      },
    },
    {
      say: 'When it is final, click Submit, and confirm. A submitted document is locked, so nobody can change it by mistake.',
      async run(h, at) {
        const submit = h.page.locator('.page-actions button.btn-primary:visible', { hasText: 'Submit' }).first();
        await at(2.0); await h.click(submit, { after: 800 });
        const yes = h.page.locator('.modal.show button:visible', { hasText: 'Yes' }).last();
        await at(4.2); await h.click(yes, { after: 300 });
        await h.page.waitForFunction(() => cur_frm.doc.docstatus === 1, null, { timeout: 10000 });
        await h.ready();
        await at(6.0); await h.highlight(h.page.locator('.page-head .indicator-pill:visible').first(), 2400, 4);
      },
    },
    {
      say: 'If a submitted document is wrong, you cannot edit it. Instead, click Cancel and confirm. It stays in the system, marked Cancelled, so there is always a record.',
      async run(h, at) {
        const cancel = h.page.locator('.page-actions button:visible', { hasText: /^Cancel$/ }).first();
        await at(3.6); await h.click(cancel, { after: 800 });
        const yes = h.page.locator('.modal.show button:visible', { hasText: 'Yes' }).last();
        await at(5.4); await h.click(yes, { after: 300 });
        await h.page.waitForFunction(() => cur_frm.doc.docstatus === 2, null, { timeout: 10000 });
        await h.ready();
        await at(8.0); await h.highlight(h.page.locator('.page-head .indicator-pill:visible').first(), 2400, 4);
      },
    },
    {
      say: 'Then click Amend. This makes a new copy that you can correct. It keeps a link to the cancelled original, and gets the same number with a dash and 1 at the end.',
      async run(h, at) {
        const amend = h.page.locator('.page-actions button.btn-primary:visible', { hasText: 'Amend' }).first();
        await at(1.2); await h.transition(() => h.click(amend, { after: 200 }));
        const from = h.page.locator('.frappe-control[data-fieldname=amended_from]:visible').first();
        await at(5.6); if (await from.count()) await h.highlight(from, 2800, 6);
      },
    },
    {
      say: 'Correct what was wrong, then save and submit the amended copy, just like before.',
      async run(h, at) {
        const row = h.page.locator('.frappe-control[data-fieldname=items] .grid-body .grid-row:visible').first();
        await h.scroll(260);
        await at(0.6); await h.click(row.locator('[data-fieldname=qty]').first(), { after: 400 });
        const qty = row.locator('input[data-fieldname=qty]:visible').first();
        await h.click(qty, { after: 150 }); await h.press('Control+a'); await h.type('120', 120); await h.press('Tab');
        await h.sleep(600); await h.scroll(-600);
        await at(3.4); await h.moveTo(h.page.locator('.page-actions button.btn-primary:visible').first());
      },
    },
    {
      card: { code: 'F4', kicker: 'Next · F4', title: 'Report view: group, sort and export to Excel', sub: 'You have finished F3. All training videos are in Learning.' },
      say: 'That is the life of every document: draft, submitted, and if needed, cancelled and amended. Next, video F4 shows Report view, and how to export to Excel.',
    },
  ],
};

// Pick the dropdown option containing `text` under a Link field (form dropdowns use role=option).
async function pickOption(h, text) {
  const opt = h.page.locator('.awesomplete ul[role=listbox] [role=option]:visible', { hasText: text }).first();
  await opt.waitFor({ timeout: 8000 });
  await h.moveTo(opt); await h.sleep(250);
  await h.click(opt, { after: 900 });
}

// Delete every quotation for the demo customer (amended drafts first, then cancelled originals).
async function removeDemo(h) {
  await h.page.evaluate(async cust => {
    const hdr = { 'X-Frappe-CSRF-Token': window.frappe?.csrf_token || '' };
    const r = await (await fetch('/api/resource/Quotation?limit_page_length=50&fields=' + encodeURIComponent('["name","docstatus"]') + '&filters=' + encodeURIComponent(JSON.stringify([['party_name', '=', cust]])))).json();
    const rows = (r.data || []).sort((a, b) => b.name.length - a.name.length); // "-1" amendments before originals
    for (const q of rows) {
      if (q.docstatus === 1) await fetch('/api/method/frappe.client.cancel', { method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' }, body: JSON.stringify({ doctype: 'Quotation', name: q.name }) });
      await fetch('/api/resource/Quotation/' + encodeURIComponent(q.name), { method: 'DELETE', headers: hdr });
    }
  }, CUSTOMER).catch(() => {});
}
