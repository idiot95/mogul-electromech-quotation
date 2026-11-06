// F4 · Report view: group, sort and export to Excel  (Foundations, everyone, ~3 min)
// Changes nothing permanent on staging: grouping, sorting and columns are list settings, saved
// before recording and put back afterwards. The exported file is downloaded and discarded.
module.exports = {
  code: 'F4',
  title: 'Report view: group, sort and export to Excel',
  version: '1.0',
  start: '/desk/sales-order',
  keepSettings: ['Sales Order'],
  async warmup(h) { await h.go('/desk/sales-order'); },
  scenes: [
    {
      card: { kicker: 'F4 · Foundations', title: 'Report view: group, sort and export to Excel', sub: 'Turn any list into a table you can analyse · 3 minutes' },
      say: 'Report view turns any list into a table, like a spreadsheet. You can choose the columns, group and total the rows, and export to Excel.',
    },
    {
      say: 'Open a list, here Sales Orders. Click the List View button, and choose Report.',
      async run(h, at) {
        const lv = h.page.locator('button:visible:has-text("List View")').first();
        await at(2.6); await h.click(lv, { after: 700 });
        const rep = h.page.locator('.dropdown-menu.show a:visible', { hasText: 'Report' }).first();
        await at(4.4); await h.moveTo(rep); await h.sleep(250);
        await h.transition(() => h.click(rep, { after: 200 }));
      },
    },
    {
      say: 'Each document is now a row, and each field is a column. The same filters work here as in the list.',
      async run(h, at) {
        await at(0.8); await h.highlight(h.page.locator('.dt-header:visible').first(), 2800, 4);
        await at(4.6); await h.highlight(h.page.locator('.standard-filter-section:visible').first(), 2400, 6);
      },
    },
    {
      say: 'Click the arrow on any column header to sort by that column, or to remove a column you do not need.',
      async run(h, at) {
        const head = h.page.locator('.dt-header .dt-cell[data-col-index]', { hasText: 'Delivery Date' }).first();
        await at(1.0); await h.moveTo(head); await h.sleep(500);
        const dd = head.locator('.dt-dropdown__toggle').first();
        await at(2.6); await h.click(dd, { after: 700, fx: 0.5 });
        const asc = h.page.locator('.dt-dropdown__list-item:visible', { hasText: 'Sort Ascending' }).first();
        await at(4.4); await h.moveTo(asc); await h.highlight(h.page.locator('.dt-dropdown__list:visible').first(), 2400, 4);
        await at(6.6); await h.click(asc, { after: 300 }); await h.ready();
      },
    },
    {
      say: 'To total the rows by something, use Group By. Here we group the orders by delivery status, and count how many are in each.',
      async run(h, at) {
        const add = h.page.locator('button:visible:has-text("Add Group")').first();
        await at(2.0); await h.click(add, { after: 800 });
        const sel = h.page.locator('.popover:visible select, .popover:visible .group-by-field select').first();
        await at(4.6); await h.moveTo(sel); await h.sleep(200);
        await sel.selectOption({ label: 'Delivery Status' }).catch(async () => { await sel.selectOption('delivery_status'); });
        await h.ready(); await h.press('Escape'); await h.sleep(500);
        await at(8.2); await h.highlight(h.page.locator('.dt-scrollable:visible, .dt-body:visible').first(), 2600, 4);
      },
    },
    {
      say: 'Use Pick Columns from the menu to choose exactly which fields to show. Then, to take the table into Excel, open the menu again and choose Export.',
      async run(h, at) {
        const menu = h.page.locator('.page-actions button.icon-btn:visible, .page-actions .menu-btn-group button:visible').last();
        await at(1.6); await h.click(menu, { after: 700 });
        await at(2.6); await h.highlight(h.page.locator('.dropdown-menu.show a:visible', { hasText: 'Pick Columns' }).first(), 2200, 4);
        const exp = h.page.locator('.dropdown-menu.show a:visible', { hasText: 'Export' }).first();
        await at(6.4); await h.moveTo(exp); await h.sleep(300); await h.click(exp, { after: 1000 });
      },
    },
    {
      say: 'Choose Excel, and whether to export all rows or only the ones you selected. Click Export, and the file downloads, ready to open in Excel.',
      async run(h, at) {
        const dlg = h.page.locator('.modal.show:visible').first();
        await at(0.6); await h.highlight(dlg.locator('.modal-content').first(), 3200, 4);
        const go = dlg.locator('button.btn-primary:visible').first();
        await at(6.6); await h.moveTo(go); await h.sleep(300);
        const dl = h.page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
        await h.click(go, { after: 800 });
        const f = await dl; if (f) await f.delete().catch(() => {});
        // The browser's own "Download started" bar is not part of the ERP: hide it.
        await h.page.evaluate(() => document.querySelectorAll('.desk-alert, .alert-container .alert, .toast-container .toast').forEach(e => { if (/download/i.test(e.innerText)) e.remove(); })).catch(() => {});
      },
    },
    {
      say: 'To keep this layout, save it from the menu with Save As, and give the report a name. It then appears under Select Report next time.',
      async run(h, at) {
        await h.press('Escape'); await h.sleep(300);
        const menu = h.page.locator('.page-actions button.icon-btn:visible, .page-actions .menu-btn-group button:visible').last();
        await at(1.6); await h.click(menu, { after: 700 });
        await at(3.0); await h.highlight(h.page.locator('.dropdown-menu.show a:visible', { hasText: 'Save As' }).first(), 2400, 4);
        await at(5.6); await h.press('Escape'); await h.sleep(300);
        await at(6.4); await h.highlight(h.page.locator('button:visible:has-text("Select Report")').first(), 2600, 6);
      },
    },
    {
      card: { code: 'F5', kicker: 'Next · F5', title: 'Assignments, ToDos, comments and @mentions', sub: 'You have finished F4. All training videos are in Learning.' },
      say: 'That is Report view: sort, group, and export to Excel. Next, video F5 shows how to assign work to people, and use comments and mentions.',
    },
  ],
};
