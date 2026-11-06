// F5 · Assignments, ToDos, comments and @mentions  (Foundations, everyone, ~4 min)
// Uses a draft quotation for DEMO-Customer India, made off-camera in warmup. Ends on the HCC My Work
// page, with every task except the demo one blurred. Changes on staging: that quotation, one assignment (ToDo + share) and one comment for the DEMO Trainee user, and the
// trainee's notifications. All removed after recording. Email is off on staging, so nothing is sent.
const CUSTOMER = 'DEMO-Customer India', ITEM = 'DEMO-Carbon Brush 20x32x40';
const TRAINEE = 'demo.trainee@hatimcarbon.com', TRAINEE_NAME = 'DEMO Trainee';

module.exports = {
  code: 'F5',
  title: 'Assignments, ToDos, comments and @mentions',
  version: '1.0',
  start: '/desk/quotation',
  keepSettings: [],
  async warmup(h) {
    await h.go('/desk/quotation'); await removeDemo(h);
    const q = await h.page.evaluate(async ([cust, itemName]) => {
      const item = (await frappe.db.get_value('Item', { item_name: itemName }, 'name')).message.name;
      return (await frappe.call('frappe.client.insert', { doc: { doctype: 'Quotation', quotation_to: 'Customer', party_name: cust, items: [{ item_code: item, qty: 100, rate: 45 }] } })).message.name;
    }, [CUSTOMER, ITEM]);
    module.exports.start = '/desk/quotation/' + q;
    await h.go('/desk/my-work'); await h.go(module.exports.start); // load both pages' code off-camera
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
        await at(4.6); await h.click(desc, { after: 200 }); await h.press('Control+a'); await h.press('Backspace'); await h.type('Please check the rate and send this quotation.', 45);
        const add = m.locator('.btn-primary:visible', { hasText: 'Add' }).first();
        await h.moveTo(add); await h.sleep(300);
        await h.click(add, { after: 300 });
        await h.page.waitForFunction(() => !document.querySelector('.modal.show') && (cur_frm.get_docinfo().assignments || []).length, null, { timeout: 10000 });
        await h.ready();
      },
    },
    {
      say: 'Their picture now shows under Assign. They get a notification, and the task appears in their My Work, with the date and the note.',
      async run(h, at) {
        await at(0.6); await h.highlight(h.page.locator('.form-assignments:visible').first(), 3000, 6);
      },
    },
    {
      say: 'To discuss the document, scroll down to Comments, and type your message. To bring someone in, type the at sign and the start of their name, and pick them from the list.',
      async run(h, at) {
        const box = h.page.locator('.comment-input-container .ql-editor:visible').first();
        await at(1.2); await box.evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'center' })); await h.sleep(1000);
        await at(3.4); await focusComment(h);
        await h.type('Rate looks low for this size. ', 55);
        if (!/Rate looks low/.test(await h.page.locator('.comment-input-container .ql-editor:visible').first().innerText())) { await focusComment(h); await h.type('Rate looks low for this size. ', 55); }
        await at(7.0); await h.type('@DEMO', 140);
        const item = h.page.locator('.ql-mention-list-item:visible', { hasText: TRAINEE_NAME }).first();
        await item.waitFor({ timeout: 8000 }).catch(async e => {
          await h.page.screenshot({ path: require('path').join(__dirname, '..', 'out', 'F5-mention-fail.png') }).catch(() => {});
          console.log('[F5] mention debug', JSON.stringify(await h.page.evaluate(() => ({ active: document.activeElement?.className, text: document.querySelector('.comment-input-container .ql-editor')?.innerText, lists: [...document.querySelectorAll('.ql-mention-list-container')].map(x => x.style.display + '|' + x.innerText) }))));
          throw e;
        });
        await h.moveTo(item); await h.sleep(400);
        await h.click(item, { after: 300 });
        await h.type(' please confirm.', 55);
      },
    },
    {
      say: 'Click Comment. The comment stays on the document for everyone to see, so the full story is in one place, not in chats and calls. The person you mentioned gets a notification.',
      async run(h, at) {
        const btn = h.page.locator('.comment-box .btn-comment:visible').first();
        await at(0.6); await h.click(btn, { after: 300 });
        await h.page.waitForFunction(async () => (await frappe.db.count('Comment', { filters: { reference_name: cur_frm.doc.name, comment_type: 'Comment' } })) > 0, null, { timeout: 10000, polling: 500 });
        await h.ready();
        const posted = h.page.locator('.new-timeline .timeline-item:visible', { hasText: 'Rate looks low' }).last();
        // Staging does not push the new comment to the open page live; reload the form to show it.
        if (!(await posted.count())) { await h.page.evaluate(() => cur_frm.reload_doc()); await h.ready(); }
        await posted.waitFor({ timeout: 8000 });
        await posted.evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'center' })); await h.sleep(800);
        await at(3.0); if (await posted.count()) await h.highlight(posted, 3200, 6);
        await at(8.0); await h.tip('Ask questions about a document in its comments, and mention the person. Then the answer stays with the document.', 5500);
      },
    },
    {
      say: 'Everyone sees their tasks in one place: My Work. A pop-up shows your work for the day when you log in, and the full page is one click away. At the top: what is overdue, what is due today, what is still open, and what you finished this week.',
      async run(h, at) {
        await at(1.0);
        await h.transition(async () => { await h.page.evaluate(() => frappe.set_route('my-work')); await demoOnly(h); });
        await at(7.6); await h.highlight(h.page.locator('.hcc-mw-ncs:visible').first(), 5200, 6);
        await at(9.2); await h.moveTo(h.page.locator('.hcc-mw-nc:visible').first());
        await at(10.8); await h.moveTo(h.page.locator('.hcc-mw-nc:visible').nth(1));
        await at(12.4); await h.moveTo(h.page.locator('.hcc-mw-nc:visible').nth(2));
      },
    },
    {
      say: 'The tabs split the work. To Do is the work given to you. Assigned by Me is the work you gave to others, so you can follow it up. Here is the quotation we just assigned.',
      async run(h, at) {
        const tab = t => h.page.locator('.hcc-mwp-views button:visible, .hcc-mwp-view:visible', { hasText: t }).first();
        await at(1.6); await h.moveTo(tab('To Do'));
        await at(3.8); await h.click(tab('Assigned by Me'), { after: 600 }); await demoOnly(h); await h.ready();
        const search = h.page.locator('input[placeholder^="Search title"]:visible').first();
        await at(7.4); await h.click(search, { after: 200 }); await h.type(module.exports.start.split('/').pop(), 70);
        await taskRow(h).waitFor({ timeout: 8000 }); await h.sleep(500);
        await h.highlight(taskRow(h), 3000, 4);
      },
    },
    {
      say: 'On each task, the buttons on the right let you mark it done, change the due date, or hand it to someone else. Click the task to open the document.',
      async run(h, at) {
        const row = taskRow(h);
        // Buttons in order: Mark as done, Reschedule, Reassign (titles are stripped on camera).
        const act = t => h.page.locator('button.hcc-mwp-act:visible').nth(['Mark as done', 'Reschedule', 'Reassign'].indexOf(t));
        await at(1.6); await h.highlight(act('Mark as done'), 1600, 4); await h.moveTo(act('Mark as done'));
        await at(3.0); await h.highlight(act('Reschedule'), 1600, 4); await h.moveTo(act('Reschedule'));
        await at(4.4); await h.highlight(act('Reassign'), 1600, 4); await h.moveTo(act('Reassign'));
        await at(6.6); await h.moveTo(row.locator('.hcc-mwp-title a').first());
        await at(8.4); await h.tip('Start each day from My Work. Close each task when it is done, so the lists stay true.', 5000);
      },
    },
    {
      card: { code: 'F6', kicker: 'Next · F6', title: 'Print, download a PDF and email a document', sub: 'You have finished F5. All training videos are in Learning.' },
      say: 'That is how to assign work, follow it in My Work, and talk about it with comments and mentions. Next, video F6 shows how to print a document, download a P D F, and email it.',
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

// My Work lists real tasks: blur every row except the demo quotation's. Keeps working as rows change.
async function demoOnly(h) {
  await h.page.evaluate(q => {
    if (window.__demoOnly) return; window.__demoOnly = true;
    const st = document.createElement('style'); st.textContent = '.hcc-mwp-row:not(.__demo) .hcc-mwp-main, .hcc-mwp-row:not(.__demo) > div:not(:last-child){filter:blur(7px)!important}';
    document.head.appendChild(st);
    const mark = () => document.querySelectorAll('.hcc-mwp-row').forEach(r => r.classList.toggle('__demo', r.innerText.includes(q)));
    mark(); new MutationObserver(mark).observe(document.body, { childList: true, subtree: true });
  }, CUSTOMER).catch(() => {});
}

// The form redraws its comment box when the assignment is saved, so find it fresh and check it took focus.
async function focusComment(h) {
  for (let i = 0; i < 4; i++) {
    const box = h.page.locator('.comment-input-container .ql-editor:visible').first();
    await h.click(box, { after: 300 });
    if (await h.page.evaluate(() => !!document.activeElement?.closest('.comment-input-container'))) return;
    await box.evaluate(e => e.focus()).catch(() => {}); await h.sleep(200);
    if (await h.page.evaluate(() => !!document.activeElement?.closest('.comment-input-container'))) return;
    await h.sleep(600);
  }
  throw new Error('comment box would not take focus');
}

const taskRow = h => h.page.locator('.hcc-mwp-row:visible', { has: h.page.locator('.hcc-mwp-main') }).first();
