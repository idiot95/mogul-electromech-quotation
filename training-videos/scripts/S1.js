// S1 · Leads and organizations in Frappe CRM  (Sales & CRM, sales team, ~5 min)
// Records in the CRM app (/crm). Every list row that is not a DEMO record is blurred, and the CRM's
// "Getting started" panel is hidden. Changes on staging: one CRM Organization (DEMO-Organization
// India, made off-camera) and one CRM Lead (DEMO Buyer), both deleted after recording.
const erp = require('../lms/erp.js');
const ORG = 'DEMO-Organization India';

module.exports = {
  code: 'S1',
  title: 'Leads and organizations in Frappe CRM',
  version: '1.0',
  start: '/crm/leads',
  // Real leads and organizations are blurred unless marked as DEMO (see demoOnly below).
  // Only list rows (a link wrapping a grid row); the sidebar and breadcrumbs stay readable.
  privacyCSS: 'a:has(> .contents > .grid):not(.__demo){filter:blur(7px)!important}',
  async warmup(h) {
    saveViews();
    removeDemo();
    erp.insert('CRM Organization', { organization_name: ORG, website: 'https://example.com' });
    await demoOnly(h);
  },
  async cleanup() { removeDemo(); restoreViews(); },
  scenes: [
    {
      card: { kicker: 'S1 · Sales & CRM', title: 'Leads and organizations in Frappe CRM', sub: 'Record every enquiry, and keep one record for each company · 5 minutes' },
      say: 'Every enquiry starts in the C R M. In this video, you will learn how to record a new enquiry as a lead, and how to find the company it belongs to.',
    },
    {
      say: 'Open the C R M from the apps screen. On the left: Leads for new enquiries, Deals for real opportunities, then Contacts, Organizations, Notes and Tasks.',
      async run(h, at) {
        await settle(h);
        await at(4.2); await h.highlight(h.page.locator('a:visible', { hasText: 'Leads' }).first(), 1500, 4);
        await at(6.2); await h.highlight(h.page.locator('a:visible', { hasText: 'Deals' }).first(), 1500, 4);
        await at(8.0); await h.highlight(h.page.locator('a:visible', { hasText: 'Organizations' }).first(), 1800, 4);
      },
    },
    {
      say: 'A lead is a new enquiry: a person, at a company, who is interested in what we make. The list shows each lead, its company, and its status.',
      async run(h, at) {
        const first = h.page.locator('a[href*="/crm/leads/CRM-"]:visible').first();
        await at(1.0); await h.highlight(first.locator('xpath=..').first(), 3600, 4);
      },
    },
    {
      say: 'Before you create anything, search. The person or the company may already be in the C R M. Type the company name in the Organization box.',
      async run(h, at) {
        const box = h.page.locator('input[placeholder="Organization"]:visible').first();
        await at(4.6); await h.click(box, { after: 200 }); await h.type('DEMO-Organization', 90);
        await h.press('Enter'); await h.sleep(1500); await settle(h);
        await at(9.0); await h.tip('Search before you create. One company, one record: check the email domain or GST number if you are not sure.', 6000);
      },
    },
    {
      say: 'There is no lead for this company yet, so we create one. Click Create.',
      async run(h, at) {
        const create = h.page.locator('button:visible', { hasText: /^\s*Create\s*$/ }).first();
        await at(2.6); await h.click(create, { after: 300 });
        await h.page.locator('[role=dialog] input[placeholder="First Name"]').first().waitFor({ timeout: 8000 }); await h.sleep(400);
      },
    },
    {
      say: 'Fill in the person\'s name, email and mobile number, and the company, spelled exactly as it is in the C R M. The status starts as New. Then click Create.',
      async run(h, at) {
        const d = h.page.locator('[role=dialog]').last();
        const fill = async (ph, text, speed = 70) => { await h.click(d.locator(`input[placeholder="${ph}"]`).first(), { after: 150 }); await h.type(text, speed); };
        await at(0.8); await fill('First Name', 'DEMO');
        await fill('Last Name', 'Buyer');
        await at(3.0); await fill('Email', 'demo.buyer@example.com', 45);
        await fill('Mobile No.', '9800000000', 60);
        await at(6.4); await fill('Organization', ORG, 55);
        await at(9.6); await h.highlight(d.locator('button', { hasText: 'New' }).first(), 1800, 4);
        const go = d.locator('button:visible', { hasText: /^\s*Create\s*$/ }).last();
        await at(12.4); await h.transition(() => h.click(go, { after: 200 }), { expectNav: false });
        await h.page.locator('text=DEMO Buyer').first().waitFor({ timeout: 10000 }); await settle(h);
      },
    },
    {
      say: 'The lead opens. Everything about the enquiry stays here: activity, emails, comments, calls, tasks and notes.',
      async run(h, at) {
        await at(1.6); await h.highlight(h.page.locator('button:visible, [role=tab]:visible', { hasText: 'Activity' }).first().locator('xpath=..'), 4200, 4);
      },
    },
    {
      say: 'On the right, fill in where the enquiry came from: the source. This tells us which exhibitions, references and campaigns bring real business.',
      async run(h, at) {
        const src = h.page.locator('button:visible', { hasText: 'Add Source' }).first();
        await at(1.6); await h.click(src, { after: 500 });
        const opt = h.page.locator('[role=option]:visible, [role=listbox] li:visible, [role=menuitem]:visible', { hasText: 'Exhibition' }).first();
        await opt.waitFor({ timeout: 6000 }); await h.moveTo(opt); await h.sleep(300); await h.click(opt, { after: 600 });
        await at(6.6); await h.tip('Always fill in the Source. It shows which exhibitions, references and campaigns bring orders.', 5000);
      },
    },
    {
      say: 'As you work the enquiry, keep the status up to date: Contacted once you have spoken to them, then Qualified, Nurture, or Unqualified.',
      async run(h, at) {
        const st = h.page.locator('button:visible', { hasText: /^\s*New\s*$/ }).first();
        await at(1.8); await h.click(st, { after: 500 });
        const opt = h.page.locator('[role=menuitem]:visible, [role=option]:visible, button:visible', { hasText: /^\s*Contacted\s*$/ }).first();
        await opt.waitFor({ timeout: 6000 }); await h.moveTo(opt); await h.sleep(300); await h.click(opt, { after: 800 });
        await at(6.0); await h.highlight(h.page.locator('button:visible', { hasText: 'Contacted' }).first(), 2600, 4);
      },
    },
    {
      say: 'When the enquiry becomes a real opportunity, with a drawing or a quantity to quote, click Convert to Deal. Deals are covered in the next video.',
      async run(h, at) {
        await at(2.8); await h.highlight(h.page.locator('button:visible', { hasText: 'Convert to Deal' }).first(), 3600, 6);
      },
    },
    {
      say: 'Companies live under Organizations. Search here too, before you add one. This company is already in the C R M, so we use it, and do not add it again.',
      async run(h, at) {
        await at(1.2); await h.transition(() => h.page.locator('a:visible', { hasText: 'Organizations' }).first().click()); await settle(h);
        const box = h.page.locator('input[placeholder="Organization Name"]:visible').first();
        await at(4.0); await h.click(box, { after: 200 }); await h.type('DEMO-Organization', 90); await h.press('Enter'); await h.sleep(1500); await settle(h);
        await at(8.4); await h.highlight(h.page.locator('a.__demo:has(> .contents):visible').first(), 2600, 4);
      },
    },
    {
      say: 'Open it to see the company\'s deals and contacts in one place. Every lead and deal for this company should point to this one record.',
      async run(h, at) {
        // Click the name: clicking another cell in a CRM list filters the list by that value.
        const name = h.page.locator('a.__demo:has(> .contents):visible').first().getByText(ORG, { exact: true }).first();
        await at(0.8); await h.transition(() => h.click(name, { after: 200 }), { expectNav: false });
        await h.page.getByText(ORG, { exact: true }).first().waitFor({ timeout: 10000 }).catch(() => {}); await settle(h);
        await at(4.4); await h.highlight(h.page.locator('button:visible, [role=tab]:visible', { hasText: 'Deals' }).first().locator('xpath=..'), 3200, 4);
      },
    },
    {
      card: { code: 'S2', kicker: 'Next · S2', title: 'Work the deal pipeline', sub: 'You have finished S1. All training videos are in Learning.' },
      say: 'That is how to record a lead, and find its organization, without making duplicates. Next, video S2 shows how to work the deal pipeline.',
    },
  ],
};

// Wait until the CRM has drawn its list or page (it never goes network-quiet; ready() handles that).
async function settle(h) {
  // Short: the CRM keeps redrawing small things (relative times), so the page never fully "stops".
  await h.ready(2500);
  await h.page.waitForFunction(() => !document.querySelector('[class*=skeleton]'), null, { timeout: 4000 }).catch(() => {});
}

// Mark DEMO rows so the privacy CSS leaves them readable, and hide the CRM's "Getting started"
// onboarding panel and its sidebar card. Runs now and on every later page load.
async function demoOnly(h) {
  const fn = () => {
    const tick = () => {
      // Change things only when they differ: the recorder waits for the page to stop changing.
      document.querySelectorAll('a').forEach(a => { const d = /DEMO/.test(a.innerText); if (a.classList.contains('__demo') !== d) a.classList.toggle('__demo', d); });
      const w = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      let t; while ((t = w.nextNode())) {
        if (t.textContent.trim() !== 'Getting started') continue;
        const box = t.parentElement.closest('.fixed, [class*="rounded"]');
        if (box && !box.closest('a') && box.style.display !== 'none') box.style.setProperty('display', 'none', 'important');
      }
    };
    setInterval(tick, 200); document.addEventListener('DOMContentLoaded', tick);
  };
  await h.page.addInitScript(fn);
  await h.page.evaluate(fn).catch(() => {});
}

// Delete the DEMO lead(s) and organization, with any notes, tasks and comments on them.
function removeDemo() {
  try {
    for (const l of erp.list('CRM Lead', [['first_name', 'like', 'DEMO%']], ['name'])) {
      for (const dt of ['FCRM Note', 'CRM Task', 'Comment']) {
        try { for (const n of erp.list(dt, [['reference_docname', '=', l.name]], ['name'])) erp.remove(dt, n.name); } catch (e) {}
      }
      erp.remove('CRM Lead', l.name);
    }
    for (const o of erp.list('CRM Organization', [['name', 'like', 'DEMO-%']], ['name'])) erp.remove('CRM Organization', o.name);
  } catch (e) { console.warn('  ! S1 cleanup:', e.message); }
}

// The CRM saves list filters (the search boxes) in the user's CRM View Settings on the server.
// Keep them as they were before recording, and remove any view the recording created.
let views = null;
const VIEW_FIELDS = ['filters', 'order_by', 'columns', 'rows', 'group_by_field', 'kanban_columns', 'kanban_fields', 'column_field', 'title_field'];
function saveViews() {
  try { const me = erp.me(); views = erp.list('CRM View Settings', [['user', '=', me]], ['name', ...VIEW_FIELDS]); } catch (e) { console.warn('  ! S1 could not save CRM views:', e.message); }
}
function restoreViews() {
  if (!views) return;
  try {
    const me = erp.me(), keep = new Set(views.map(v => String(v.name)));
    for (const v of views) { const doc = {}; for (const f of VIEW_FIELDS) if (f in v) doc[f] = v[f]; erp.update('CRM View Settings', v.name, doc); }
    for (const v of erp.list('CRM View Settings', [['user', '=', me]], ['name'])) if (!keep.has(String(v.name))) erp.remove('CRM View Settings', v.name);
    console.log('  restored CRM view settings');
  } catch (e) { console.warn('  ! S1 could not restore CRM views:', e.message); }
}
