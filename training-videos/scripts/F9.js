// F9 · The document chain: keep everything linked  (Foundations, everyone, ~3 min)
// Best practice, not an enforced rule: make each document from the one before it.
// Changes on staging: a DEMO quotation (submitted) and a sales order made from it (submitted).
// Both are cancelled and deleted after recording. Neither posts to accounts or stock.
// Needs demo-data.js (DEMO-Customer India, DEMO-Carbon Brush and its default BOM).
const CUSTOMER = 'DEMO-Customer India';

module.exports = {
  code: 'F9',
  title: 'The document chain: keep everything linked',
  version: '1.0',
  start: '/desk/quotation',
  keepSettings: ['Quotation', 'Sales Order'],
  async warmup(h) {
    await h.go('/desk/quotation');
    await removeDemo(h);
    const q = await h.page.evaluate(async cust => {
      const item = (await frappe.db.get_value('Item', { item_name: 'DEMO-Carbon Brush 20x32x40' }, 'name')).message.name;
      const d = await frappe.call('frappe.client.insert', { doc: { doctype: 'Quotation', quotation_to: 'Customer', party_name: cust, items: [{ item_code: item, qty: 100, rate: 45 }] } });
      return (await frappe.call('frappe.client.submit', { doc: d.message })).message.name;
    }, CUSTOMER);
    module.exports.start = '/desk/quotation/' + q;
  },
  async cleanup(h) { await removeDemo(h); },
  scenes: [
    {
      card: { kicker: 'F9 · Foundations', title: 'The document chain: keep everything linked', sub: 'Make each document from the one before it · 3 minutes' },
      say: 'In this video you will see the best way to create documents in the E R P, so that every order stays linked from the first quotation to the final shipment.',
    },
    {
      chain: {
        kicker: 'Best practice', title: 'Make each document from the one before it',
        steps: [
          { doc: 'Quotation', note: 'what we offered' },
          { doc: 'Sales Order', note: 'made from the quotation; BOM chosen on each line we make', hl: true },
          { doc: 'Work Order', note: 'made from the sales order' },
          { doc: 'Delivery Note', note: 'made from the sales order' },
          { doc: 'Shipment', note: 'linked to the delivery note' },
        ],
        links: [
          { doc: 'Purchase Order', to: 'Material Request', note: 'buying follows the same idea' },
          { doc: 'Purchase Receipt', to: 'Purchase Order', note: 'so goods received match what was ordered' },
        ],
      },
      say: 'Here is the chain. A sales order is made from the quotation. Work orders and delivery notes are made from the sales order, and the shipment is linked to the delivery note. Buying works the same way. When you follow the chain, anyone can trace an order from start to finish.',
      pad: 1.2,
    },
    {
      say: 'Start from the submitted quotation. Do not create a new sales order from scratch. Instead, click Create, and choose Sales Order.',
      async run(h, at) {
        await h.tip('Make the Sales Order from the Quotation, so the two stay linked.', 6500);
        const create = h.page.locator('.page-actions button:visible', { hasText: 'Create' }).first();
        await at(4.6); await h.click(create, { after: 700 });
        const so = h.page.locator('.dropdown-menu.show a:visible', { hasText: 'Sales Order' }).first();
        await at(7.0); await h.moveTo(so); await h.sleep(300);
        await h.transition(() => h.click(so, { after: 200 }));
      },
    },
    {
      say: 'The new sales order is already filled in from the quotation: the customer, the item, the quantity and the price. Enter the date the customer needs the goods.',
      async run(h, at) {
        await h.scroll(380);
        const row = h.page.locator('.frappe-control[data-fieldname=items] .grid-body .grid-row:visible').first();
        await at(1.0); await h.highlight(row, 3800, 4);
        await at(6.6);
        const cell = row.locator('[data-fieldname=delivery_date]').first();
        await h.click(cell, { after: 300 });
        await h.page.waitForFunction(() => document.activeElement?.getAttribute('data-fieldname') === 'delivery_date', null, { timeout: 5000 }).catch(() => {});
        await h.press('Control+a'); await h.type(dueDate(), 90); await h.press('Tab');
        // Close the date picker: it stays open after typing a date into a table cell.
        await h.press('Escape');
        await h.page.evaluate(() => { document.activeElement?.blur(); document.querySelectorAll('.datepicker.active').forEach(d => d.classList.remove('active')); });
        await h.sleep(500);
        await h.page.evaluate(async d => { const r = cur_frm.doc.items[0]; if (!r.delivery_date) await frappe.model.set_value(r.doctype, r.name, 'delivery_date', frappe.datetime.user_to_str(d)); }, dueDate());
      },
    },
    {
      say: 'On the same line is the B O M, the bill of materials we will make it with. For items we manufacture, check it is the right one. The default B O M fills in by itself.',
      async run(h, at) {
        const row = h.page.locator('.frappe-control[data-fieldname=items] .grid-body .grid-row:visible').first();
        const bom = row.locator('[data-fieldname=bom_no]').first();
        const head = h.page.locator('.frappe-control[data-fieldname=items] .grid-heading-row [data-fieldname=bom_no]:visible').first();
        await at(0.8); await h.moveTo(bom);
        await at(2.6); await h.highlight(head, 4200, 6); await h.highlight(bom, 4200, 6);
        await h.tip('Check the BOM on every line we manufacture.', 6000);
      },
    },
    {
      say: 'Save and submit the sales order, as you saw in video F3.',
      async run(h, at) {
        await h.scroll(-800);
        await at(0.6); await h.press('Control+s');
        await h.page.waitForFunction(() => !cur_frm.doc.__islocal && !cur_frm.is_dirty(), null, { timeout: 12000 });
        await h.ready();
        const submit = h.page.locator('.page-actions button.btn-primary:visible', { hasText: 'Submit' }).first();
        await at(2.2); await h.click(submit, { after: 700 });
        await h.click(h.page.locator('.modal.show button:visible', { hasText: 'Yes' }).last(), { after: 300 });
        await h.page.waitForFunction(() => cur_frm.doc.docstatus === 1, null, { timeout: 12000 });
        await h.ready();
      },
    },
    {
      say: 'From here, the next documents are made with the Create button too. Work orders for production, delivery notes for dispatch, and material requests for buying all start from this sales order.',
      async run(h, at) {
        const create = h.page.locator('.page-actions button:visible', { hasText: 'Create' }).first();
        await at(1.4); await h.click(create, { after: 700 });
        await at(4.2); await h.moveTo(h.page.locator('.dropdown-menu.show a:visible', { hasText: 'Work Order' }).first());
        await at(6.4); await h.moveTo(h.page.locator('.dropdown-menu.show a:visible', { hasText: 'Delivery Note' }).first());
        await at(8.4); await h.moveTo(h.page.locator('.dropdown-menu.show a:visible', { hasText: 'Material Request' }).first());
        await h.tip('Create Work Orders and Delivery Notes from the Sales Order.', 5000);
        await at(11.6); await h.press('Escape');
      },
    },
    {
      say: 'Open the Connections tab to see everything linked to this order. Here is the quotation it came from, and the B O M. As work orders, delivery notes and shipments are made, they appear here too.',
      async run(h, at) {
        const tab = h.page.locator('.form-tabs .nav-link:visible', { hasText: 'Connections' }).first();
        await at(0.6); await h.click(tab, { after: 900 });
        const q = h.page.locator('.document-link:visible', { hasText: 'Quotation' }).first();
        const bom = h.page.locator('.document-link:visible', { hasText: 'BOM' }).first();
        await at(4.4); await h.highlight(q, 2800, 6);
        await at(6.4); await h.highlight(bom, 2600, 6);
        await at(9.0); await h.highlight(h.page.locator('.document-link:visible', { hasText: 'Work Order' }).first(), 2200, 6);
      },
    },
    {
      card: { code: '✓', kicker: 'Foundations complete', title: 'Next: the training for your desk', sub: 'Sales, Purchase, Production, Operations or Management. All videos are in Learning.' },
      say: 'That completes Foundations. Remember: make each document from the one before it, and everything stays linked. Next, go to the training for your own desk.',
    },
  ],
};

const dueDate = () => { const d = new Date(Date.now() + 30 * 864e5); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; };
// Cancel and delete every Sales Order, then every Quotation, for the demo customer.
async function removeDemo(h) {
  await h.page.evaluate(async cust => {
    const hdr = { 'X-Frappe-CSRF-Token': window.frappe?.csrf_token || '' };
    for (const dt of ['Sales Order', 'Quotation']) {
      const field = dt === 'Quotation' ? 'party_name' : 'customer';
      const r = await (await fetch(`/api/resource/${encodeURIComponent(dt)}?limit_page_length=50&fields=${encodeURIComponent('["name","docstatus"]')}&filters=${encodeURIComponent(JSON.stringify([[field, '=', cust]]))}`)).json();
      for (const d of (r.data || []).sort((a, b) => b.name.length - a.name.length)) {
        if (d.docstatus === 1) await fetch('/api/method/frappe.client.cancel', { method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' }, body: JSON.stringify({ doctype: dt, name: d.name }) });
        await fetch(`/api/resource/${encodeURIComponent(dt)}/${encodeURIComponent(d.name)}`, { method: 'DELETE', headers: hdr });
      }
    }
  }, CUSTOMER).catch(() => {});
}
