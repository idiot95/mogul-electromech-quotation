const B = "http://localhost:8787/api";
const j = (m, p, b) => fetch(B + p, { method: m, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined }).then(async r => { if (!r.ok) throw new Error(p + " " + r.status + " " + await r.text()); return r.json(); });
const sm = await j("GET", "/salesmen");
const emails = { Taher: "taher@mogulelectromech.com", Mustafa: "mustafa@mogulelectromech.com", Husain: "husain@mogulelectromech.com", Murtaza: "murtaza@mogulelectromech.com", Mehalm: "mehalm@mogulelectromech.com", Mustansir: "mustansir@mogulelectromech.com" };
for (const s of sm) await j("PUT", "/salesmen/" + s.id, { ...s, email: emails[s.name] });
const cust = [
  { name: "AL FUTTAIM ENGINEERING LLC", address: "Al Rashidiya, Dubai, UAE", contact_person: "Mr. Rajesh Kumar", email: "procurement@example-afe.ae", payment_terms: "30 days PDC", validity: "30 days", delivery_terms: "Ex-stock, subject to prior sale", vat_terms: "VAT 5% extra as per UAE law" },
  { name: "EMIRATES STEEL FABRICATION", address: "Mussafah M-40, Abu Dhabi, UAE", contact_person: "Mr. Ahmed Saleh", email: "purchase@example-esf.ae" },
  { name: "GULF MARINE SERVICES", address: "Hamriyah Free Zone, Sharjah, UAE", contact_person: "Ms. Priya Nair", email: "buyer@example-gms.ae", payment_terms: "50% advance, 50% on delivery" },
  { name: "DUBAI ALUMINIUM WORKSHOP", address: "Al Quoz Ind. Area 3, Dubai, UAE", contact_person: "Mr. Omar Farooq" },
];
const ids = {};
for (const c of cust) ids[c.name] = (await j("POST", "/customers", c)).id;
const all = await j("GET", "/customers?all=1");
for (const c of all) ids[c.name] = c.id;
const smId = Object.fromEntries(sm.map(s => [s.name, s.id]));
const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const quotes = [
  ["STAR SUPER CEMENT INDUSTRIES LLC", "Taher", 3, "SSD2600027", [["SKF Deep groove ball bearing 6205-2RS", 20, "Nos.", 38], ["V-Belt B-52, Fenner", 12, "Nos.", 24.5], ["Hydraulic hose 1/2\" x 2 m with fittings", 6, "Nos.", 145]], "emailed"],
  ["AL FUTTAIM ENGINEERING LLC", "Mustafa", 6, "AFE/PR/4471", [["ABB Contactor AF38-30-00, 24V DC coil", 8, "Nos.", 312], ["Schneider MCB 3P 32A C-curve", 15, "Nos.", 96], ["Cable gland M25 nickel-plated brass", 50, "Nos.", 11]], "printed"],
  ["EMIRATES STEEL FABRICATION", "Husain", 9, "ESF-0912", [["Welding cable 70 sq.mm", 100, "Mtr", 42], ["Grinding disc 7\" x 6 mm, Norton", 200, "Nos.", 9.5]], "emailed"],
  ["GULF MARINE SERVICES", "Taher", 12, "GMS/RFQ/221", [["Stainless steel ball valve 2\" 316, BSP", 10, "Nos.", 265], ["Pressure gauge 0-16 bar, 100 mm dial", 10, "Nos.", 88]], "draft"],
  ["DUBAI ALUMINIUM WORKSHOP", "Murtaza", 15, null, [["Hilti anchor HST3 M12x115", 300, "Nos.", 6.75], ["Safety helmet, white, with ratchet", 40, "Nos.", 18]], "printed"],
  ["STAR SUPER CEMENT INDUSTRIES LLC", "Mustansir", 20, "SSD2600019", [["Gearbox oil Shell Omala S2 GX 220, 209 L", 2, "Drum", 2150], ["Grease Mobilux EP2, 18 kg", 6, "Pail", 310]], "emailed"],
];
for (const [cn, s, ago, enq, ls, st] of quotes) {
  const c = all.find(x => x.name === cn);
  const q = await j("POST", "/quotes", { quote_date: d(ago), customer_id: c.id, customer_name: c.name, customer_address: c.address, attention: c.contact_person, enquiry_ref: enq, salesman_id: smId[s], payment_terms: c.payment_terms || "100% in advance with PO", validity: c.validity || "20 days", delivery_terms: c.delivery_terms || "2–3 weeks, DDP your site", vat_terms: c.vat_terms || "VAT 5% extra as per UAE law", vat_rate: 5, lines: ls.map(([description, qty, unit, rate]) => ({ kind: "item", description, qty, unit, rate })) });
  if (st !== "draft") await j("POST", `/quotes/${q.id}/status`, { status: st });
  console.log(q.base_number);
}
const star = all.find(x => x.name.startsWith("STAR SUPER"));
await j("PUT", "/customers/" + star.id, { ...star, contact_person: "Mr. Suresh Menon", email: "purchase@example-ssc.ae", phone: "+971 4 880 1234" });
