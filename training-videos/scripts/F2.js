// F2 · Search bar, list views, filters and saved views  (Foundations, everyone, ~3 min)
// Changes on staging: one saved filter named "DEMO-…" (deleted after recording). The Sales Order
// list settings (filters, sort) are saved before recording and put back afterwards.
const SAVED = 'DEMO-Open orders to deliver';

module.exports = {
  code: 'F2',
  title: 'Search bar, list views, filters and saved views',
  version: '1.0',
  start: '/desk/sales-order',
  keepSettings: ['Sales Order'],
  async warmup(h) { await h.go('/desk/sales-order'); await removeSaved(h); },
  async cleanup(h) { await removeSaved(h); },
  // PO-number column on the Sales Order list.
  privacyCSS: '.list-row .level-left .list-row-col:nth-child(7){filter:blur(6px)!important}',
  scenes: [
    {
      card: { kicker: 'F2 · Foundations', title: 'Search bar, list views, filters and saved views', sub: 'Lists, filters, sorting and saved filters · 3 minutes' },
      say: 'In this video you will learn how to work with lists: quick filters, the Filters button, sorting, and saved filters you can use again and again.',
    },
    {
      say: 'Every type of document has a list like this one, for Sales Orders. Each row is one order, and the coloured label shows its status, such as To Bill or Overdue.',
      async run(h, at) {
        const first = h.page.locator('.frappe-list .list-row:visible').first();
        await at(4.5); await h.highlight(first, 2600, 4);
        await at(7.6); await h.moveTo(first.locator('.indicator-pill:visible').first());
      },
    },
    {
      say: 'The boxes along the top are quick filters. Pick a value, and the list updates straight away. Here we show only the orders that are not delivered yet.',
      async run(h, at) {
        const sel = h.page.locator('.standard-filter-section:visible [data-fieldname=delivery_status] select:visible').first();
        await at(1.2); await h.highlight(h.page.locator('.standard-filter-section:visible').first(), 2400, 6);
        await at(6.6); await h.moveTo(sel); await h.sleep(300);
        await h.transition(() => sel.selectOption('Not Delivered'), { expectNav: false });
        await h.highlight(sel, 1800, 4);
      },
    },
    {
      say: 'The Filters button shows every filter in use. This list already keeps only open, submitted orders, plus the filter we just added. Add a Filter lets you filter on any field.',
      async run(h, at) {
        const btn = h.page.locator('button.filter-button:visible').first();
        await at(1.6);
        const pop = h.page.locator('.popover:visible, .filter-popover:visible').first();
        // Open the box under a still, and show it only once its filter rows have loaded.
        await h.transition(async () => {
          await h.click(btn, { after: 200 });
          await h.page.waitForFunction(() => [...document.querySelectorAll('.popover .filter-field, .filter-popover .filter-field, .popover .filter-box')].some(e => e.offsetParent), null, { timeout: 6000 });
        }, { expectNav: false });
        await at(4.4); await h.highlight(pop, 3600, 6);
        await at(9.2); await h.moveTo(h.page.locator('text=Add a Filter >> visible=true').first());
        await at(11.6); await h.press('Escape'); await h.sleep(300);
        if (await pop.isVisible().catch(() => false)) await h.click(btn, { after: 500 });
      },
    },
    {
      say: 'On the right, choose which field to sort by, and switch between newest first and oldest first.',
      async run(h, at) {
        const sort = h.page.locator('.sort-selector:visible').first();
        await at(0.8); await h.highlight(sort, 2600, 6);
        const dir = sort.locator('button:visible').first();
        await at(3.6); await h.moveTo(dir); await h.sleep(250);
        await h.transition(() => dir.click(), { expectNav: false });
        await at(6.2); await h.transition(() => dir.click(), { expectNav: false });
      },
    },
    {
      say: 'If you use the same filters often, save them. Open Saved Filters, choose Save Current Filter, give it a name, and click Create.',
      async run(h, at) {
        await at(2.4); await h.click(h.page.locator('button:visible:has-text("Saved Filters")').first(), { after: 600 });
        await at(4.4); await h.click(h.page.locator('text=Save Current Filter >> visible=true').first(), { after: 900 });
        const name = h.page.locator('.modal.show [data-fieldname=filter_name] input').first();
        await at(6.0); await h.click(name, { after: 200 }); await h.type(SAVED, 70);
        await at(9.4); await h.click(h.page.locator('.modal.show button:has-text("Create")').first(), { after: 1000 });
      },
    },
    {
      say: 'Next time, open Saved Filters and pick it from the list. Only you can see it, unless you tick the option to share it with everyone.',
      async run(h, at) {
        await at(1.6); await h.click(h.page.locator('button:visible:has-text("Saved Filters")').first(), { after: 700 });
        const item = h.page.locator(`text=${SAVED} >> visible=true`).first();
        await at(3.4); await h.moveTo(item); await h.highlight(item, 2600, 6);
        await at(8.0); await h.press('Escape');
      },
    },
    {
      say: 'At the bottom, choose how many rows to show at once, or click Load More to see the next page.',
      async run(h, at) {
        await at(0.6); await h.scroll(1400, 28);
        const paging = h.page.locator('.list-paging-area:visible').first();
        await at(2.4); await h.highlight(paging, 3200, 6);
        await at(4.6); await h.moveTo(paging.locator('button:has-text("100")').first());
        await at(6.2); await h.moveTo(paging.locator('button:has-text("Load More")').first());
      },
    },
    {
      say: 'The List View button switches to other views of the same documents, such as Report view, which video F4 covers.',
      async run(h, at) {
        await h.scroll(-1400, 28);
        await at(1.8); await h.click(h.page.locator('button:visible:has-text("List View")').first(), { after: 700 });
        await at(3.4); await h.highlight(h.page.locator('.dropdown-menu.show:visible').first(), 2800, 4);
        await at(6.6); await h.press('Escape');
      },
    },
    {
      say: 'To start again, click the cross next to Filters. That clears every filter on this list.',
      async run(h, at) {
        const x = h.page.locator('button.filter-x-button:visible, button[data-hcc-title="Clear all filters"]:visible').first();
        await at(1.6); await h.moveTo(x); await h.highlight(x, 1800, 4);
        await at(3.6); await h.click(x, { after: 300 });
        await h.page.waitForFunction(() => !/\d/.test(document.querySelector('button.filter-button')?.innerText || ''), null, { timeout: 8000 });
        await h.ready();
      },
    },
    {
      card: { code: 'F3', kicker: 'Next · F3', title: 'Create, save, submit, cancel and amend a document', sub: 'You have finished F2. All training videos are in Learning.' },
      say: 'That is it for lists. Next, video F3 shows how to create, save, submit, cancel and amend a document.',
    },
  ],
};

// Delete the demo saved filter (if a previous run left one behind).
async function removeSaved(h) {
  await h.page.evaluate(async name => {
    const hdr = { 'X-Frappe-CSRF-Token': window.frappe?.csrf_token || '' };
    const r = await (await fetch('/api/resource/List%20Filter?filters=' + encodeURIComponent(JSON.stringify([['filter_name', 'like', 'DEMO-%'], ['reference_doctype', '=', 'Sales Order']])))).json();
    for (const f of r.data || []) await fetch('/api/resource/List%20Filter/' + encodeURIComponent(f.name), { method: 'DELETE', headers: hdr });
  }, SAVED);
}
