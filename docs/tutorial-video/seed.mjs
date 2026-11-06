// Demo data for the tutorial (latest app: users = Sales Reps, sign-in, won/lost).
import { execFileSync } from "node:child_process";
import { webcrypto as crypto } from "node:crypto";
const REPO = new URL("../..", import.meta.url).pathname;
const B = "http://localhost:8787/api";
const ITER = 100_000, b64 = (b) => Buffer.from(b).toString("base64");
async function hash(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const h = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITER }, key, 256);
  return `pbkdf2-sha256$${ITER}$${b64(salt)}$${b64(h)}`;
}
const sql = (s) => execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", s], { cwd: REPO, stdio: ["ignore", "ignore", "inherit"] });
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const reps = { Taher: "taher", Mustafa: "mustafa", Mehalm: "mehalm", Husain: "husain", Murtaza: "murtaza", Mustansir: "mustansir" };
const phones = { Taher: "+971 50 412 7730", Mustafa: "+971 55 218 4409", Husain: "+971 50 993 1182", Murtaza: "+971 52 640 2215", Mehalm: "+971 56 120 7781", Mustansir: "+971 50 377 0924" };
let s = "";
for (const [n, u] of Object.entries(reps)) s += `UPDATE users SET active=1, email=${q(u + "@mogulelectromech.com")}, phone=${q(phones[n])}, password_hash=${q(await hash("Mogul#2026"))}, must_change_password=0 WHERE display_name=${q(n)};`;
s += `INSERT INTO users (username, display_name, password_hash, role, must_change_password, email) VALUES ('admin','Office Admin',${q(await hash("Admin#2026"))},'admin',0,'sales@mogulelectromech.com');`;
sql(s);

async function session(username, password) {
  const r = await fetch(B + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
  if (!r.ok) throw new Error("login " + username + " " + r.status + " " + (await r.text()));
  const cookie = r.headers.get("set-cookie").split(";")[0];
  return (m, p, b) =>
    fetch(B + p, { method: m, headers: { "content-type": "application/json", cookie }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => {
      if (!r.ok) throw new Error(p + " " + r.status + " " + (await r.text()));
      return r.json();
    });
}
const admin = await session("admin", "Admin#2026");
const users = await admin("GET", "/users");
const uid = Object.fromEntries(users.map((u) => [u.display_name, u.id]));

const cust = [
  { name: "AL FUTTAIM ENGINEERING LLC", address: "Al Rashidiya, Dubai, UAE", contact_person: "Mr. Rajesh Kumar", email: "procurement@example-afe.ae", payment_terms: "30 days PDC", validity: "30 days", delivery_terms: "Ex-stock, subject to prior sale", vat_terms: "VAT 5% extra as per UAE law" },
  { name: "EMIRATES STEEL FABRICATION", address: "Mussafah M-40, Abu Dhabi, UAE", contact_person: "Mr. Ahmed Saleh", email: "purchase@example-esf.ae" },
  { name: "GULF MARINE SERVICES", address: "Hamriyah Free Zone, Sharjah, UAE", contact_person: "Ms. Priya Nair", email: "buyer@example-gms.ae", payment_terms: "50% advance, 50% on delivery" },
  { name: "DUBAI ALUMINIUM WORKSHOP", address: "Al Quoz Ind. Area 3, Dubai, UAE", contact_person: "Mr. Omar Farooq" },
];
for (const c of cust) await admin("POST", "/customers", c);
let all = await admin("GET", "/customers?all=1");
const star = all.find((x) => x.name.startsWith("STAR SUPER"));
await admin("PUT", "/customers/" + star.id, { ...star, contact_person: "Mr. Suresh Menon", email: "purchase@example-ssc.ae", phone: "+971 4 880 1234" });
all = await admin("GET", "/customers?all=1");

const taher = await session("taher", "Mogul#2026");
const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
// [who creates, customer, rep, days ago, enquiry, lines, outcome]
const quotes = [
  [taher, "STAR SUPER CEMENT INDUSTRIES LLC", "Taher", 4, "SSD2600027", [["SKF Deep groove ball bearing 6205-2RS", 20, "Nos.", 38], ["V-Belt B-52, Fenner", 12, "Nos.", 24.5], ["Hydraulic hose 1/2\" x 2 m with fittings", 6, "Nos.", 145]], "won"],
  [taher, "GULF MARINE SERVICES", "Taher", 8, "GMS/RFQ/221", [["Stainless steel ball valve 2\" 316, BSP", 10, "Nos.", 265], ["Pressure gauge 0-16 bar, 100 mm dial", 10, "Nos.", 88]], "emailed"],
  [taher, "AL FUTTAIM ENGINEERING LLC", "Taher", 12, "AFE/PR/4471", [["ABB Contactor AF38-30-00, 24V DC coil", 8, "Nos.", 312], ["Schneider MCB 3P 32A C-curve", 15, "Nos.", 96], ["Cable gland M25 nickel-plated brass", 50, "Nos.", 11]], "lost"],
  [taher, "DUBAI ALUMINIUM WORKSHOP", "Taher", 16, null, [["Hilti anchor HST3 M12x115", 300, "Nos.", 6.75], ["Safety helmet, white, with ratchet", 40, "Nos.", 18]], "printed"],
  [taher, "EMIRATES STEEL FABRICATION", "Taher", 22, "ESF-0912", [["Welding cable 70 sq.mm", 100, "Mtr", 42], ["Grinding disc 7\" x 6 mm, Norton", 200, "Nos.", 9.5]], "won"],
  [admin, "STAR SUPER CEMENT INDUSTRIES LLC", "Mustansir", 20, "SSD2600019", [["Gearbox oil Shell Omala S2 GX 220, 209 L", 2, "Drum", 2150], ["Grease Mobilux EP2, 18 kg", 6, "Pail", 310]], "emailed"],
];
for (const [api, cn, rep, ago, enq, ls, st] of quotes) {
  const c = all.find((x) => x.name === cn);
  const qt = await api("POST", "/quotes", {
    quote_date: d(ago), customer_id: c.id, customer_name: c.name, customer_address: c.address, attention: c.contact_person, enquiry_ref: enq, sales_rep_id: uid[rep],
    payment_terms: c.payment_terms || "100% in advance with PO", validity: c.validity || "20 days", delivery_terms: c.delivery_terms || "2–3 weeks, DDP your site", vat_terms: c.vat_terms || "VAT 5% extra as per UAE law", vat_rate: 5,
    lines: ls.map(([description, qty, unit, rate]) => ({ kind: "item", description, qty, unit, rate })),
  });
  if (st === "won") {
    await api("POST", `/quotes/${qt.id}/status`, { status: "emailed" });
    await api("POST", `/quotes/${qt.id}/orders`, { po_number: "PO-" + (4400 + qt.id), po_date: d(Math.max(0, ago - 2)), lines: qt.lines.filter((l) => l.kind === "item").map((l) => ({ pos: l.pos, qty: l.qty, rate: l.rate })) });
  } else if (st === "lost") {
    await api("POST", `/quotes/${qt.id}/status`, { status: "emailed" });
    await api("POST", `/quotes/${qt.id}/lost`, { reason: "Price", note: "Competitor quoted 8% lower" });
  } else if (st !== "draft") await api("POST", `/quotes/${qt.id}/status`, { status: st });
  console.log(qt.base_number, st);
}
// Taher signs in for the first time in the video, with a temporary password from the admin
sql(`UPDATE users SET password_hash=${q(await hash("amber-river-4821"))}, must_change_password=1 WHERE username='taher'; DELETE FROM sessions;`);
