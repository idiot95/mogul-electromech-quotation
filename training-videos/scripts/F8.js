// F8 · Raise an ERP Ticket when something is wrong  (Foundations, everyone, ~3 min)
// Uses the HCC support button (ERP Edits app): opens the Support panel, fills in a report on a DEMO
// draft quotation, and sends it. Changes on staging: the quotation and one ERP Ticket, both deleted
// after recording. The DevOps agent reads tickets from live, not staging, so it never sees this one.
const CUSTOMER = 'DEMO-Customer India', ITEM = 'DEMO-Carbon Brush 20x32x40';
let before = [];

module.exports = {
  code: 'F8',
  title: 'Raise an ERP Ticket when something is wrong',
  version: '1.0',
  start: '/desk/quotation',
  async warmup(h) {
    await h.go('/desk/quotation'); await removeDemo(h);
    before = await h.page.evaluate(async () => frappe.db.get_list('ERP Ticket', { pluck: 'name', limit: 0 }));
    const q = await h.page.evaluate(async ([cust, itemName]) => {
      const item = (await frappe.db.get_value('Item', { item_name: itemName }, 'name')).message.name;
      return (await frappe.call('frappe.client.insert', { doc: { doctype: 'Quotation', quotation_to: 'Customer', party_name: cust, items: [{ item_code: item, qty: 100, rate: 45 }] } })).message.name;
    }, [CUSTOMER, ITEM]);
    module.exports.start = '/desk/quotation/' + q;
    await h.go(module.exports.start);
  },
  async cleanup(h) {
    await h.page.evaluate(() => document.querySelectorAll('.modal.show .btn-modal-close').forEach(b => b.click())).catch(() => {});
    await removeDemo(h);
  },
  scenes: [
    {
      card: { kicker: 'F8 · Foundations', title: 'Raise an ERP Ticket when something is wrong', sub: 'Report a problem, and follow it until it is fixed · 3 minutes' },
      say: 'If something in the E R P does not work, is too slow, or you need access to something, raise an E R P ticket. It goes straight to the people who fix it.',
    },
    {
      say: 'Stay on the page where it went wrong, so the ticket knows where you were. Then click the support button, at the bottom right of every page.',
      async run(h, at) {
        const btn = h.page.locator('.hcc-report-issue button:visible').first();
        await at(3.4); await h.highlight(btn, 2600, 8);
        await at(6.4); await h.click(btn, { after: 300 });
        await h.page.locator('.modal.show button:visible', { hasText: 'Report a new issue' }).first().waitFor({ timeout: 8000 }); await h.sleep(400);
      },
    },
    {
      say: 'The support panel shows your tickets, and where each one has got to: received, being looked at, being fixed, testing, and live. Click Report a new issue.',
      async run(h, at) {
        const m = h.page.locator('.modal.show:visible').last();
        await at(2.6); await h.highlight(m.locator('.modal-body').first(), 5400, 4);
        const add = m.locator('button:visible', { hasText: 'Report a new issue' }).first();
        await at(8.8); await h.click(add, { after: 300 });
        await h.page.locator('.modal.show [data-fieldname=ticket_type] select').first().waitFor({ timeout: 8000 }); await h.sleep(400);
      },
    },
    {
      say: 'Choose the type: something is broken, something is slow, an idea, or you need access. Then say what you were trying to do, and what happened instead. Be exact: which button you clicked, and what it said.',
      async run(h, at) {
        const m = h.page.locator('.modal.show:visible').last();
        const type = m.locator('[data-fieldname=ticket_type] select').first();
        await at(1.2); await h.moveTo(type); await h.sleep(300); await type.selectOption('Something is broken'); await h.sleep(400);
        const tried = m.locator('[data-fieldname=trying_to_do] textarea').first();
        await at(5.6); await h.click(tried, { after: 200 }); await h.type(`Make a sales order from this quotation for ${CUSTOMER}.`, 35);
        const what = m.locator('[data-fieldname=what_happened] textarea').first();
        await h.click(what, { after: 200 }); await h.type('Sales Order is missing from the Create menu.', 35);
      },
    },
    {
      say: 'Say how urgent it is. Blocking my work means you cannot carry on without it. A screenshot helps a lot: on Windows, press Windows, Shift and S, select the area, and paste it here.',
      async run(h, at) {
        const m = h.page.locator('.modal.show:visible').last();
        const urg = m.locator('[data-fieldname=urgency] select').first();
        await urg.evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'center' })); await h.sleep(600);
        await at(1.0); await h.moveTo(urg); await h.sleep(300); await urg.selectOption('Annoying'); await h.sleep(300);
        await at(2.6); await h.highlight(m.locator('[data-fieldname=urgency]').first(), 2600, 4);
        await at(6.2); await h.highlight(m.locator('[data-fieldname=screenshot]').first(), 4200, 4);
      },
    },
    {
      say: 'The ticket also sends the page you were on, your browser, and any recent errors, so you do not need to explain those. Click Send report.',
      async run(h, at) {
        const m = h.page.locator('.modal.show:visible').last();
        const sent = m.locator('[data-fieldname=sent]').first();
        await sent.evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'center' })).catch(() => {}); await h.sleep(500);
        await at(0.6); await h.highlight(sent, 3600, 4);
        const send = m.locator('.btn-primary:visible', { hasText: 'Send report' }).first();
        await at(6.4); await h.click(send, { after: 300 });
        await h.page.locator('.modal.show:visible', { hasText: 'Thank you' }).first().waitFor({ timeout: 10000 }); await h.sleep(400);
      },
    },
    {
      say: 'You get a ticket number, and you can follow every step from the support button. When it reaches Live, the fix is in the E R P you use every day.',
      async run(h, at) {
        const m = h.page.locator('.modal.show:visible', { hasText: 'Thank you' }).last();
        await at(0.8); await h.highlight(m.locator('.modal-body').first(), 4400, 4);
        await at(6.4); await h.tip('One problem per ticket. Say exactly what you clicked and what you saw, and add a screenshot.', 5500);
      },
    },
    {
      card: { code: 'F9', kicker: 'Next · F9', title: 'The document chain: keep everything linked', sub: 'You have finished F8. All training videos are in Learning.' },
      say: 'That is how to raise an E R P ticket, and follow it until it is fixed. Next, video F9 shows the document chain, and how to keep everything linked.',
    },
  ],
};

// Delete the demo quotations, and any ERP Ticket this recording created (anything not there before).
async function removeDemo(h) {
  await h.page.evaluate(async ([cust, before]) => {
    const del = (dt, n) => frappe.call({ method: 'frappe.client.delete', args: { doctype: dt, name: n } }).catch(() => {});
    const mine = await frappe.db.get_list('ERP Ticket', { filters: { owner: frappe.session.user, creation: ['>=', frappe.datetime.get_today()] }, fields: ['name', 'expected'], limit: 50 });
    for (const t of mine) {
      if (before.includes(t.name) || !String(t.expected || '').includes(cust)) continue; // only tickets about the DEMO quotation
      for (const dt of ['ToDo', 'Comment', 'Communication']) for (const n of await frappe.db.get_list(dt, { filters: { reference_name: t.name }, pluck: 'name' }).catch(() => [])) await del(dt, n);
      for (const n of await frappe.db.get_list('File', { filters: { attached_to_name: t.name }, pluck: 'name' }).catch(() => [])) await del('File', n);
      await del('ERP Ticket', t.name);
    }
    for (const q of await frappe.db.get_list('Quotation', { filters: { party_name: cust }, fields: ['name', 'docstatus'], limit: 50 })) {
      if (q.docstatus === 1) await frappe.call('frappe.client.cancel', { doctype: 'Quotation', name: q.name }).catch(() => {});
      await del('Quotation', q.name);
    }
  }, [CUSTOMER, before]).catch(e => console.warn('  ! F8 cleanup:', e.message));
}
