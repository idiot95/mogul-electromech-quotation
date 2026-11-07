// F6 · Print, download a PDF and email a document  (Foundations, everyone, ~3 min)
// Uses a submitted quotation for DEMO-Customer India, made off-camera in warmup and deleted after.
// Nothing is printed, downloaded or sent: Print and PDF open browser windows, so they are only pointed
// at, and the email is written but not sent (email is off on staging). The email "To" suggestions
// list real contacts, so every suggestion except the DEMO one is blurred.
const CUSTOMER = 'DEMO-Customer India', ITEM = 'DEMO-Carbon Brush 20x32x40';
const TO = 'demo.trainee@hatimcarbon.com';

module.exports = {
  code: 'F6',
  title: 'Print, download a PDF and email a document',
  version: '1.1',
  start: '/desk/quotation',
  keepSettings: ['Quotation'],
  // Email suggestions are real contacts: blurred unless marked as the DEMO address (see blurContacts).
  privacyCSS: '.modal .awesomplete li:not(.__demo){filter:blur(7px)!important}',
  async warmup(h) {
    await h.go('/desk/quotation'); await removeDemo(h);
    const q = await h.page.evaluate(async ([cust, itemName]) => {
      const item = (await frappe.db.get_value('Item', { item_name: itemName }, 'name')).message.name;
      const d = (await frappe.call('frappe.client.insert', { doc: { doctype: 'Quotation', quotation_to: 'Customer', party_name: cust, items: [{ item_code: item, qty: 100, rate: 45 }] } })).message;
      await frappe.call('frappe.client.submit', { doc: d });
      return d.name;
    }, [CUSTOMER, ITEM]);
    module.exports.start = '/desk/quotation/' + q;
    await h.go('/desk/print/Quotation/' + q); await h.go(module.exports.start); // load both pages' code off-camera
  },
  async cleanup(h) {
    await h.page.evaluate(() => document.querySelectorAll('.modal.show .btn-modal-close').forEach(b => b.click())).catch(() => {});
    await removeDemo(h);
  },
  scenes: [
    {
      card: { kicker: 'F6 · Foundations', title: 'Print, download a PDF and email a document', sub: 'Send a document to a customer, straight from the ERP · 3 minutes' },
      say: 'In this video, you will learn how to print a document, save it as a P D F, and email it to a customer, straight from the E R P.',
    },
    {
      say: 'Open the document, here a submitted quotation. To see how it will look on paper, click the printer icon at the top right.',
      async run(h, at) {
        const pr = h.page.locator('.form-sidebar .form-print:visible').first();
        await at(3.6); await h.highlight(pr, 2000, 6);
        await at(5.6); await h.transition(() => h.click(pr, { after: 200 }));
      },
    },
    {
      say: 'This is the print preview. On the left, the print format sets the layout of the page, and the letter head adds our logo and company details.',
      async run(h, at) {
        await at(3.4); await h.highlight(ctl(h, 'print_format'), 2400, 6);
        await at(6.2); await h.highlight(ctl(h, 'letterhead'), 2400, 6);
      },
    },
    {
      say: 'To try another layout, choose a different format, and the preview updates. Our quotations use Quotation New, so we switch back to it.',
      async run(h, at) {
        await at(1.4); await pickFormat(h, 'Quotation Standard');
        await at(6.4); await pickFormat(h, 'Quotation [New]');
      },
    },
    {
      say: 'To save it as a file, click P D F. To print on paper, click Print, and choose your printer.',
      async run(h, at) {
        const btn = t => h.page.locator('.page-actions button:visible', { hasText: t }).first();
        await at(1.6); await h.highlight(btn('PDF'), 2000, 4); await h.moveTo(btn('PDF'));
        await at(4.0); await h.highlight(btn('Print'), 2000, 4); await h.moveTo(btn('Print'));
        await at(6.4); await h.tip('Always send customers the PDF from the ERP, never a screenshot or a retyped copy. The PDF has the right number, prices and terms.', 6500);
      },
    },
    {
      say: 'To email it, go back to the document. Scroll down to Activity, and click New Email.',
      async run(h, at) {
        await at(0.8); await h.transition(() => h.page.goBack());
        const btn = h.page.locator('.new-timeline button:visible', { hasText: 'New Email' }).first();
        await at(2.6); await btn.evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'center' })); await h.sleep(900);
        await at(4.2); await h.click(btn, { after: 300 });
        await h.page.locator('.modal.show [data-fieldname=recipients] input:visible').first().waitFor({ timeout: 8000 });
        await h.sleep(500);
      },
    },
    {
      say: 'In To, type the customer\'s email address, and pick it from the list. The subject is already filled in, with the quotation number.',
      async run(h, at) {
        const m = h.page.locator('.modal.show:visible').last();
        const to = m.locator('[data-fieldname=recipients] input:visible').first();
        await blurContacts(h);
        await at(1.6); await h.click(to, { after: 200 }); await h.type('demo.trainee', 90);
        const opt = h.page.locator('.modal.show .awesomplete li:visible', { hasText: TO }).first();
        await opt.waitFor({ timeout: 8000 }); await h.moveTo(opt); await h.sleep(300); await h.click(opt, { after: 400 });
        await h.click(m.locator('.modal-title').first(), { after: 300 });
        await at(5.8); await h.highlight(m.locator('[data-fieldname=subject]').first(), 2600, 4);
      },
    },
    {
      say: 'Write a short message. Then tick Attach Document Print, so the P D F goes with the email.',
      async run(h, at) {
        const m = h.page.locator('.modal.show:visible').last();
        const body = m.locator('[data-fieldname=content] .ql-editor').first();
        await at(0.8); await h.click(body, { after: 200 }); await h.press('Control+Home');
        await h.type('Dear Sir,\nPlease find our quotation attached. ', 45); await h.press('Enter');
        const attach = m.locator('[data-fieldname=attach_document_print] input[type=checkbox]').first();
        await attach.evaluate(e => e.scrollIntoView({ block: 'center' }));
        await at(5.4); await h.click(attach, { after: 300 });
        await h.highlight(m.locator('[data-fieldname=attach_document_print]').first(), 2400, 6);
      },
    },
    {
      say: 'Check everything once more, then click Send. The email is saved in the document\'s activity, so everyone can see what was sent, and when.',
      async run(h, at) {
        const m = h.page.locator('.modal.show:visible').last();
        const send = m.locator('.modal-footer .btn-primary:visible', { hasText: 'Send' }).first();
        await at(2.6); await h.moveTo(send); await h.highlight(send, 2600, 6);
      },
    },
    {
      card: { code: 'F7', kicker: 'Next · F7', title: 'Bulk upload with Data Import', sub: 'You have finished F6. All training videos are in Learning.' },
      say: 'That is how to print a document, save it as a P D F, and email it. Next, video F7 shows how to upload many records at once, with Data Import.',
    },
  ],
};

const ctl = (h, f) => h.page.locator(`.frappe-control[data-fieldname=${f}]:visible`).first();

// Choose a print format in the preview's searchable field.
async function pickFormat(h, name) {
  const inp = ctl(h, 'print_format').locator('input').first();
  await h.click(inp, { after: 200 }); await h.press('Control+a'); await h.type(name.split(' ')[1].replace(/[[\]]/g, ''), 90);
  const opt = h.page.locator('.awesomplete ul[role=listbox] [role=option]:visible', { hasText: name }).first();
  await opt.waitFor({ timeout: 8000 }); await h.moveTo(opt); await h.sleep(250);
  await h.click(opt, { after: 300 });
  await h.page.waitForFunction(() => !document.querySelector('.awesomplete ul[role=listbox]:not([hidden]) [role=option]'), null, { timeout: 3000 }).catch(() => h.press('Escape'));
  await h.sleep(1500); // the preview re-renders; this page never goes network-quiet, so wait a fixed time
}

// Mark the DEMO address in the email suggestions so it stays readable (privacyCSS blurs the rest).
async function blurContacts(h) {
  await h.page.evaluate(to => {
    if (window.__blurContacts) return; window.__blurContacts = true;
    const mark = () => document.querySelectorAll('.modal .awesomplete li').forEach(li => li.classList.toggle('__demo', li.innerText.includes(to)));
    mark(); new MutationObserver(mark).observe(document.body, { childList: true, subtree: true });
  }, TO).catch(() => {});
}

// Cancel and delete the demo quotations, and any email drafts or communications on them.
async function removeDemo(h) {
  await h.page.evaluate(async cust => {
    const del = (dt, n) => frappe.call({ method: 'frappe.client.delete', args: { doctype: dt, name: n } }).catch(() => {});
    const qs = await frappe.db.get_list('Quotation', { filters: { party_name: cust }, fields: ['name', 'docstatus'], limit: 50 });
    for (const q of qs) {
      for (const n of await frappe.db.get_list('Communication', { filters: { reference_name: q.name }, pluck: 'name', limit: 50 })) await del('Communication', n);
      if (q.docstatus === 1) await frappe.call('frappe.client.cancel', { doctype: 'Quotation', name: q.name }).catch(() => {});
      await del('Quotation', q.name);
    }
  }, CUSTOMER).catch(e => console.warn('  ! F6 cleanup:', e.message));
}
