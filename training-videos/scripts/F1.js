// F1 · Find your way around the ERP  (Foundations, everyone, ~4 min, read-only)
module.exports = {
  code: 'F1',
  title: 'Find your way around the ERP',
  version: '1.0',
  async warmup(h) { await h.go('/desk'); await h.go('/desk/sales-desk'); await h.go('/desk/sales-order'); },
  // PO-number column on the Sales Order list.
  privacyCSS: '.list-row .level-left .list-row-col:nth-child(7){filter:blur(6px)!important}',
  scenes: [
    {
      card: { kicker: 'F1 · Foundations', title: 'Find your way around the ERP', sub: 'Apps, desks, search and getting help · 2 minutes' },
      say: 'Welcome to the Hatim Carbon E R P. In the next two minutes you will learn how to find your desk, get to any screen in a few keystrokes, and ask for help when something looks wrong.',
    },
    {
      say: 'After you sign in, you land on the apps screen. Each tile opens one area of the business: Selling, Buying, Stock, Manufacturing, Quality, and our own I S O Compliance app.',
      async run(h, at) {
        await h.go('/desk');
        const tile = t => h.page.locator('.icon-title', { hasText: new RegExp('^' + t) }).first();
        await at(3.2); await h.moveTo(tile('Selling'));
        await at(4.6); await h.moveTo(tile('Buying'));
        await at(5.6); await h.moveTo(tile('Stock'));
        await at(6.6); await h.moveTo(tile('Manufactur'));
        await at(7.8); await h.moveTo(tile('Quality'));
        await at(9.4); await h.moveTo(tile('ISO Compl')); await h.highlight(tile('ISO Compl').locator('xpath=..'), 2200, 10);
      },
    },
    {
      say: 'Most of your day starts from your department desk. There are five: Sales, Purchase, Production, Operations, and Management. Here is the Sales Desk.',
      async run(h, at) {
        await at(6.5);
        await h.go('/desk/sales-desk');
        await privacy(h);
      },
    },
    {
      say: 'At the top, My Work shows your own tasks: what is overdue, what is due today, and everything still open. Click any number to see the list behind it.',
      async run(h, at) {
        await privacy(h);
        const card = h.page.locator('div', { has: h.page.locator('.hcc-mw-heading') }).filter({ hasText: 'MOST URGENT' }).last();
        await h.highlight(card, 3200, 8);
        await at(3.4); await h.moveTo(h.page.getByText('Overdue', { exact: true }).first());
        await at(5.0); await h.moveTo(h.page.getByText('Due today', { exact: true }).first());
        await at(6.4); await h.moveTo(h.page.getByText('Open', { exact: true }).first());
      },
    },
    {
      say: 'Below that, At a Glance gives the headline numbers for your department, such as the sales orders still waiting to be delivered.',
      async run(h, at) {
        const glance = h.page.locator('div', { has: h.page.getByText('Sales Orders to Deliver') }).filter({ hasText: 'Delivered This FY' }).last();
        await h.highlight(glance, 3000, 8);
        await at(3.2); await h.moveTo(h.page.getByText('Sales Orders to Deliver').first());
      },
    },
    {
      say: 'Further down, the tabs group your shortcuts by area. Click Selling to see shortcuts for orders, quotations and dispatch. Each card takes you straight to the right list or form.',
      async run(h, at) {
        const tab = t => h.page.locator('button.hcc-desk-tab', { hasText: t }).first();
        await h.moveTo(tab('ISO Compliance'));
        await at(3.3); await h.click(tab('Selling'));
        await h.scroll(380);
        await at(8.0);
        const card = h.page.getByText('Open Sales Orders', { exact: true }).first();
        if (await card.isVisible().catch(() => false)) { await h.moveTo(card); await h.highlight(card.locator('xpath=ancestor::div[2]'), 2400, 6); }
      },
    },
    {
      say: 'The fastest way to get anywhere is search. Press Control and K, type what you are looking for, for example sales order, and press Enter.',
      async run(h, at) {
        await h.scroll(-600);
        await h.moveTo(h.page.locator('.item-anchor:visible', { hasText: 'Search' }).first());
        await h.highlight(h.page.locator('.item-anchor:visible', { hasText: 'Search' }).first(), 1800, 6);
        await at(3.5); await h.press('Control+k');
        await at(5.6); await h.press('Control+a'); await h.type('sales order', 110);
        await at(8.6); await pick(h, /Sales Order\s*List/);
      },
    },
    {
      say: 'You are now on the Sales Order list. Every kind of document in the E R P has a list like this. The next video shows how to filter and sort it.',
      async run(h, at) {
        await h.sleep(800);
        const rows = h.page.locator('.frappe-list, .result').first();
        await h.highlight(rows, 3500, 4);
      },
    },
    {
      say: 'To get back to your desk at any time, use search again. Press Control and K, type the name of your desk, and press Enter.',
      async run(h, at) {
        await at(3.2); await h.press('Control+k');
        await at(5.0); await h.press('Control+a'); await h.type('sales desk', 110);
        await at(7.4); await pick(h, /Sales Desk\s*Workspace/);
        if (!/sales-desk/.test(h.page.url())) throw new Error('search did not open the Sales Desk: ' + h.page.url());
        await h.sleep(600); await privacy(h);
      },
    },
    {
      say: 'If something does not work, or a screen looks wrong, click the headset button at the bottom right. Here you can report a new issue and follow your tickets until the fix is live. Video F8 shows this in detail.',
      async run(h, at) {
        const btn = h.page.locator('button.hcc-ri-glow').first();
        await at(3.6); await h.click(btn, { after: 1200 });
        const report = h.page.locator('text=Report a new issue >> visible=true').first();
        await at(6.5); await h.moveTo(report); await h.highlight(report, 2400, 6);
        await at(10.5); await h.press('Escape');
      },
    },
    {
      card: { code: 'F2', kicker: 'Next · F2', title: 'Search bar, list views, filters and saved views', sub: 'You have finished F1. Find all videos on the Wiki.' },
      say: 'That is it. You can now find your desk, jump to any screen with search, and ask for help. Next, video F2 shows how to work with lists, filters and saved views.',
    },
  ],
};

// In the Ctrl+K search results, move the highlight to the result matching `re`, then press Enter.
// The page change happens under a still of the current screen, so no loading screen is filmed.
async function pick(h, re) {
  const sel = () => h.page.evaluate(() => { const e = document.querySelector('[aria-selected="true"]'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; });
  // Wait for the results to include the target before moving the highlight.
  await h.page.waitForFunction(src => [...document.querySelectorAll('li[aria-selected], .awesomplete li, [role=listbox] li')].some(li => new RegExp(src).test(li.textContent.replace(/\s+/g, ' '))), re.source, { timeout: 6000 });
  for (let i = 0; i < 15 && !re.test(await sel()); i++) { await h.press('ArrowDown'); await h.sleep(260); }
  if (!re.test(await sel())) throw new Error(`search result ${re} not found; highlighted: ${await sel()}`);
  await h.transition(() => h.press('Enter'));
}

// Hide customer names and task text on the desk's My Work panel.
async function privacy(h) {
  await h.page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length === 0 && el.textContent.trim() === 'MOST URGENT') {
        [...el.parentElement.children].forEach(c => { if (c !== el) c.classList.add('__blur'); });
        el.parentElement.parentElement.querySelectorAll('a,button').forEach(c => { if (!/See all/.test(c.textContent)) c.classList.add('__blur'); });
      }
    }
  }).catch(() => {});
}
