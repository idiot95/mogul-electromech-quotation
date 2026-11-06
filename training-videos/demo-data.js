// Demo master data for training videos, on staging only. Every record is named "DEMO-…".
// Safe to run again: existing records are left as they are.
//
//   node training-videos/demo-data.js            # create what is missing
//   node training-videos/demo-data.js --list     # show what exists
//
// Videos that create documents (Quotations, Sales Orders, …) use these masters, so no real
// customer, supplier or price appears on screen.
'use strict';
const erp = require('./lms/erp');

if (!/staging/.test(erp.BASE)) { console.error(`Refusing to create demo data on ${erp.BASE}: staging only.`); process.exit(2); }

const MASTERS = [
  ['Customer', 'DEMO-Customer India', { customer_name: 'DEMO-Customer India', customer_type: 'Company', customer_group: 'Motor OEM', territory: 'India' }],
  ['Customer', 'DEMO-Customer Export', { customer_name: 'DEMO-Customer Export', customer_type: 'Company', customer_group: 'Wind Energy Producers', territory: 'Europe' }],
  ['Item', 'DEMO-Carbon Brush 20x32x40', { item_code: 'DEMO-Carbon Brush 20x32x40', item_name: 'DEMO-Carbon Brush 20x32x40', item_group: 'Carbon Brush', gst_hsn_code: '85452000', stock_uom: 'Nos', is_stock_item: 1, description: 'Demo item for training videos.' }],
  ['Item', 'DEMO-Carbon Block CB-50', { item_code: 'DEMO-Carbon Block CB-50', item_name: 'DEMO-Carbon Block CB-50', item_group: 'Carbon Block', gst_hsn_code: '85459090', stock_uom: 'Nos', is_stock_item: 1, description: 'Demo raw material for training videos.' }],
  ['Item', 'DEMO-Brush Holder BH-25', { item_code: 'DEMO-Brush Holder BH-25', item_name: 'DEMO-Brush Holder BH-25', item_group: 'Brush Holder', gst_hsn_code: '85030090', stock_uom: 'Nos', is_stock_item: 1, description: 'Demo item for training videos.' }],
];

// Items are numbered automatically (ST…), so they are found by item name, customers by name.
// A user to assign to and @mention in videos, so no real colleague is named or notified.
// No password: nobody can sign in as it. Sales User lets documents be assigned to it without a share pop-up.
const USERS = [{ email: 'demo.trainee@hatimcarbon.com', first_name: 'DEMO', last_name: 'Trainee', roles: ['Sales User'] }];

// A submitted default BOM for the demo carbon brush (1 brush from 1 carbon block). A BOM posts
// nothing to accounts or stock; it lets videos show choosing a BOM on a Sales Order and a Work Order.
const BOMS = [{ item: 'DEMO-Carbon Brush 20x32x40', raw: 'DEMO-Carbon Block CB-50', qty: 1 }];

const exists = (dt, name) => erp.list(dt, [[dt === 'Item' ? 'item_name' : 'name', '=', name]]).length > 0;
const list = process.argv.includes('--list');
for (const [dt, name, doc] of MASTERS) {
  if (exists(dt, name)) { console.log(`= ${dt} ${name}`); continue; }
  if (list) { console.log(`- ${dt} ${name} (missing)`); continue; }
  const r = erp.insert(dt, doc);
  console.log(`+ ${dt} ${r.name}${r.name !== name ? ' (' + name + ')' : ''}`);
}

const code = name => (erp.list('Item', [['item_name', '=', name]])[0] || {}).name;
for (const b of BOMS) {
  const item = code(b.item), raw = code(b.raw);
  if (!item || !raw) { console.log(`- BOM for ${b.item} (items missing)`); continue; }
  const have = erp.list('BOM', [['item', '=', item], ['docstatus', '=', 1]]);
  if (have.length) { console.log(`= BOM ${have[0].name}`); continue; }
  if (list) { console.log(`- BOM for ${b.item} (missing)`); continue; }
  const bom = erp.insert('BOM', { item, quantity: 1, is_active: 1, is_default: 1, items: [{ item_code: raw, qty: b.qty }] });
  erp.call('frappe.client.submit', { doc: { ...erp.get('BOM', bom.name), doctype: 'BOM' } });
  console.log(`+ BOM ${bom.name} (submitted, default)`);
}

for (const u of USERS) {
  const roles = u.roles.map(role => ({ role }));
  if (erp.list('User', [['name', '=', u.email]]).length) {
    const have = erp.get('User', u.email).roles || [], missing = u.roles.filter(r => !have.some(x => x.role === r));
    if (missing.length && !list) { erp.update('User', u.email, { roles: [...have.map(x => ({ role: x.role })), ...missing.map(role => ({ role }))] }); console.log(`~ User ${u.email}: added ${missing.join(', ')}`); }
    else console.log(`= User ${u.email}`);
    continue;
  }
  if (list) { console.log(`- User ${u.email} (missing)`); continue; }
  erp.insert('User', { ...u, roles, user_type: 'System User', send_welcome_email: 0, enabled: 1 });
  console.log(`+ User ${u.email}`);
}
