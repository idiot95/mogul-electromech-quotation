// F5 · Assignments, ToDos, comments and @mentions  (Foundations, everyone, ~4 min)
// Uses a draft quotation for DEMO-Customer India, made off-camera in warmup. Changes on staging:
// that quotation, one assignment (ToDo + share) and one comment for the DEMO Trainee user, and the
// trainee's notifications. All removed after recording. Email is off on staging, so nothing is sent.
const CUSTOMER = 'DEMO-Customer India', ITEM = 'DEMO-Carbon Brush 20x32x40';
const TRAINEE = 'demo.trainee@hatimcarbon.com', TRAINEE_NAME = 'DEMO Trainee';

module.exports = {
  code: 'F5',
  title: 'Assignments, ToDos, comments and @mentions',
  version: '1.0',
  start: '/desk/quotation',
  keepSettings: ['ToDo'],
  async warmup(h) {
    await h.go('/desk/quotation'); await removeDemo(h);
    const q = await h.page.evaluate(async ([cust, itemName]) => {
      const item = (await frappe.db.get_value('Item', { item_name: itemName }, 'name')).message.name;
      return (await frappe.call('frappe.client.insert', { doc: { doctype: 'Quotation', quotation_to: 'Customer', party_name: cust, items: [{ item_code: item, qty: 100, rate: 45 }] } })).message.name;
    }, [CUSTOMER, ITEM]);
    module.exports.start = '/desk/quotation/' + q;
    await h.go('/desk/todo'); await h.go(module.exports.start); // load both pages' code off-camera
  },
  async cleanup(h) { await removeDemo(h); },
  scenes: [
    {
      card: { kicker: 'F5 · Foundations', title: 'Assignments, ToDos, comments and @mentions', sub: 'Hand work to a colleague, and talk about it on the document · 4 minutes' },
      say: 'In this video, you will learn how to hand a document to a colleague, and how to talk about it on the document itself, with comments and mentions.',
    },
    {
      say: 'Open the document you need help with. Here, a draft quotation. On the right, next to Assign, click the plus sign.',
      async run(h, at) {
        await at(2.6); await h.highlight(h.page.locator('.form-assignments:visible').first(), 2600, 6);
        const add = h.page.locator('.add-assignment-btn:visible').first();
        await at(5.6); await h.click(add, { after: 300 });
        await h.page.locator('.modal.show [data-fieldname=assign_to] input:visible').first().waitFor({ timeout: 8000 });
        await h.sleep(400);
      },
    },
    {
      say: 'Choose the person. Start typing their name, and pick them from the list. To take the work yourself, tick Assign to Me instead.',
      async run(h, at) {
        const m = h.page.locator('.modal.show:visible').last();
        const inp = m.locator('[data-fieldname=assign_to] input:visible').first();
        await at(1.6); await h.click(inp, { after: 300 }); await h.type('DEMO', 110);
        const opt = h.page.locator('.awesomplete li:visible', { hasText: TRAINEE_NAME }).first();
        await opt.waitFor({ timeout: 8000 }); await h.moveTo(opt); await h.sleep(300);
        await h.click(opt, { after: 500 });
        await h.click(m.locator('.modal-title').first(), { after: 300 }); // close the suggestion list
        await at(6.4); await h.highlight(m.locator('[data-fieldname=assign_to_me]').first(), 2400, 4);
      },
    },
    {
      say: 'Set the date it must be done by, the priority, and a short note saying what you need. Then click Add.',
      async run(h, at) {
        const m = h.page.locator('.modal.show:visible').last();
        const date = m.locator('[data-fieldname=date] input:visible').first();
        await at(1.6); await h.click(date, { after: 300 });
        await h.type(await h.page.evaluate(() => frappe.datetime.str_to_user(frappe.datetime.add_days(frappe.datetime.get_today(), 3))), 90);
        await h.click(m.locator('.modal-title').first(), { after: 300 }); // close the date picker
        const pr = m.locator('[data-fieldname=priority] select').first();
        await at(3.4); await h.moveTo(pr); await h.sleep(200); await pr.selectOption('High'); await h.sleep(400);
        const desc = m.locator('[data-fieldname=description] .ql-editor').first();
        await at(4.6); await h.click(desc, { after: 200 }); await h.type('Please check the rate and send this quotation.', 45);
        const add = m.locator('.btn-primary:visible', { hasText: 'Add' }).first();
        await h.moveTo(add); await h.sleep(300);
        await h.click(add, { after: 300 });
        await h.page.waitForFunction(() => !document.querySelector('.modal.show') && (cur_frm.get_docinfo().assignments || []).length, null, { timeout: 10000 });
        await h.ready();
      },
    },
    {
      say: 'Their picture now shows under Assign. They get a notification, and the task goes into their ToDo list, with the date and the note.',
      async run(h, at) {
        await at(0.6); await h.highlight(h.page.locator('.form-assignments:visible').first(), 3000, 6);
      },
    },
    {
      say: 'To discuss the document, scroll down to Comments, and type your message. To bring someone in, type the at sign and the start of their name, and pick them from the list.',
      async run(h, at) {
        const box = h.page.locator('.comment-input-container .ql-editor:visible').first();
        await at(1.2); await box.evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'center' })); await h.sleep(1000);
        await at(3.4); await h.click(box, { after: 300 }); await h.type('Rate looks low for this size. ', 55);
        await at(7.0); await h.type('@DEMO', 140);
        const item = h.page.locator('.ql-mention-list-item:visible', { hasText: TRAINEE_NAME }).first();
        await item.waitFor({ timeout: 8000 }); await h.moveTo(item); await h.sleep(400);
        await h.click(item, { after: 300 });
        await h.type(' please confirm.', 55);
      },
    },
    {
      say: 'Click Comment. The comment stays on the document for everyone to see, so the full story is in one place, not in chats and calls. The person you mentioned gets a notification.',
      async run(h, at) {
        const btn = h.page.locator('.comment-input-container .btn-comment:visible').first();
        await at(0.6); await h.click(btn, { after: 300 });
        await h.page.waitForFunction(() => (cur_frm.get_docinfo().comments || []).length > 0, null, { timeout: 10000 });
        await h.ready();
        const posted = h.page.locator('.timeline-item:visible', { hasText: 'Rate looks low' }).first();
        await at(3.0); if (await posted.count()) await h.highlight(posted, 3200, 6);
        await at(8.0); await h.tip('Ask questions about a document in its comments, and mention the person. Then the answer stays with the document.', 5500);
      },
    },
    {
      say: 'Each person sees their open tasks in the ToDo list. Here is the list for our demo trainee. Click a task to open it, or click the reference to go straight to the document.',
      async run(h, at) {
        await at(1.0);
        await h.transition(() => h.page.evaluate(u => { frappe.route_options = { allocated_to: u, status: 'Open' }; frappe.set_route('List', 'ToDo'); }, TRAINEE));
        const row = h.page.locator('.frappe-list .list-row:visible').first();
        await at(5.0); if (await row.count()) await h.highlight(row, 3000, 4);
      },
    },
    {
      say: 'When the work is done, the person closes the task, or removes their name from Assign on the document. Then everyone can see it is finished.',
      async run(h, at) {
        await at(1.0); await h.highlight(h.page.locator('.standard-filter-section:visible').first(), 2600, 6);
      },
    },
    {
      card: { code: 'F6', kicker: 'Next · F6', title: 'Print, download a PDF and email a document', sub: 'You have finished F5. All training videos are in Learning.' },
      say: 'That is how to assign work, and talk about it with comments and mentions. Next, video F6 shows how to print a document, download a P D F, and email it.',
    },
  ],
};

// Remove the demo quotations and everything this video adds around them.
async function removeDemo(h) {
  await h.page.evaluate(async ([cust, u]) => {
    const del = (dt, n) => frappe.call({ method: 'frappe.client.delete', args: { doctype: dt, name: n }, freeze: false }).catch(() => {});
    const qs = await frappe.db.get_list('Quotation', { filters: { party_name: cust }, fields: ['name', 'docstatus'], limit: 50 });
    for (const q of qs) {
      for (const [dt, f] of [['ToDo', { reference_name: q.name }], ['Comment', { reference_name: q.name }], ['DocShare', { share_name: q.name }]]) {
        for (const n of await frappe.db.get_list(dt, { filters: f, pluck: 'name', limit: 100 })) await del(dt, n);
      }
      if (q.docstatus === 1) await frappe.call('frappe.client.cancel', { doctype: 'Quotation', name: q.name }).catch(() => {});
      await del('Quotation', q.name);
    }
    for (const n of await frappe.db.get_list('Notification Log', { filters: { for_user: u }, pluck: 'name', limit: 200 }).catch(() => [])) await del('Notification Log', n);
  }, [CUSTOMER, TRAINEE]).catch(e => console.warn('  ! F5 cleanup:', e.message));
}
