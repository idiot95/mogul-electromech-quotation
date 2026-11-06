// Drives the real app in a headed Chromium on Xvfb while ffmpeg grabs the screen.
// Writes timeline.json (scene start times relative to the recording start).
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const BASE = "http://localhost:8787";
const scenes = JSON.parse(fs.readFileSync(path.join(DIR, "scenes.json"), "utf8"));
const durs = JSON.parse(fs.readFileSync(path.join(DIR, "durations.json"), "utf8"));
if (process.env.FAST) for (const k in durs) durs[k] *= Number(process.env.FAST);
const PASTE = fs.readFileSync(path.join(DIR, "paste.txt"), "utf8").replace(/\n$/, "");
const DRY = process.env.DRY === "1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


(async () => {
  const W = 1536, H = 864;
  const browser = await chromium.launch({
    headless: false,
    args: [`--window-size=${W},${H}`, "--window-position=0,0", "--disable-infobars", "--hide-scrollbars", "--disable-features=Translate", "--no-first-run", "--password-store=basic"],
  });
  const ctx = await browser.newContext({ viewport: null, permissions: ["clipboard-read", "clipboard-write"], locale: "en-GB", timezoneId: "Asia/Dubai" });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await ctx.addInitScript({ path: path.join(DIR, "overlay.js") });
  await ctx.addInitScript(() => { window.print = () => {}; });
  // Show the app as the live system (no "LOCAL · test data" banner) for the training video.
  await ctx.route("**/api/health", (r) => r.fulfill({ json: { ok: true, env: "production", modules: ["quotes"] } }));
  const page = await ctx.newPage(); global.__page = page;
  { const cdp = await ctx.newCDPSession(page); const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "fullscreen" } }); await sleep(800); }
  await sleep(4500); // let the "press Esc to exit full screen" hint fade
  page.setDefaultTimeout(15000);

  // ---- helpers ----
  const ov = (fn, ...a) => page.evaluate(([fn, a]) => window.__ov[fn](...a), [fn, a]);
  let cx = 960, cy = 600;
  async function moveTo(target, { ms = 650, dx = 0.5, dy = 0.5 } = {}) {
    const loc = (typeof target === "string" ? page.locator(target) : target).first();
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const b = await loc.boundingBox();
    if (!b) throw new Error("no box for " + target);
    cx = b.x + b.width * dx; cy = b.y + b.height * dy;
    await ov("cursor", cx, cy, ms);
    await page.mouse.move(cx, cy, { steps: 8 });
    await sleep(ms + 60);
    return loc;
  }
  async function click(target, opts = {}) {
    const loc = await moveTo(target, opts);
    await ov("ripple", cx, cy);
    await sleep(120);
    await page.mouse.click(cx, cy);
    await sleep(opts.after ?? 350);
    return loc;
  }
  async function typeSlow(text, delay = 70) { await page.keyboard.type(text, { delay }); }
  async function keys(label, combo, after = 500) { await ov("keys", label, 1500); await sleep(250); await page.keyboard.press(combo); await sleep(after); }
  async function hl(target, ms) {
    if (!target) return ov("hl", null);
    const loc = (typeof target === "string" ? page.locator(target) : target).first();
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const b = await loc.boundingBox(); await ov("hl", b); if (ms) { await sleep(ms); await ov("hl", null); }
  }
  async function scrollTo(y, ms = 900) {
    await page.evaluate(([y, ms]) => {
      const s0 = window.scrollY, d = y - s0, t0 = performance.now();
      return new Promise((res) => { const f = (t) => { const k = Math.min(1, (t - t0) / ms); window.scrollTo(0, s0 + d * (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)); k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
    }, [y, ms]);
  }
  async function scrollIntoMid(sel, ms = 900) {
    const y = await page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.25);
    await scrollTo(Math.max(0, y), ms);
  }
  const role = (r, name, o = {}) => page.getByRole(r, { name, ...o });

  // ---- warm up before recording (signed out, on the sign-in page) ----
  await page.goto(BASE + "/");
  await page.getByRole("button", { name: "Sign In" }).waitFor();
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await page.reload();
  await page.getByRole("button", { name: "Sign In" }).waitFor();
  await ov("card", `<div class="logo">ME</div><h1>Mogul Workspace</h1><p>Quotations · staff training</p>`);
  await sleep(1200);

  // ---- start screen capture ----
  let ff = null;
  if (!DRY) {
    ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "x11grab", "-framerate", "30", "-video_size", `${W}x${H}`, "-draw_mouse", "0", "-i", process.env.DISPLAY + ".0+0,0",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", path.join(DIR, "raw.mp4")], { stdio: ["pipe", "inherit", "inherit"] });
    await sleep(800);
  }
  const T0 = Date.now() - (DRY ? 0 : 400); // ffmpeg start-up offset
  const timeline = [];
  let sceneStart = 0, sceneDur = 0;
  const at = async (frac) => { const t = sceneStart + frac * sceneDur * 1000; const w = t - Date.now(); if (w > 0) await sleep(w); };
  async function scene(id, fn, { pad = 600, title = true } = {}) {
    const s = scenes.find((x) => x.id === id);
    sceneDur = durs[id];
    sceneStart = Date.now();
    timeline.push({ id, t: (sceneStart - T0) / 1000 });
    console.log("scene", id, ((sceneStart - T0) / 1000).toFixed(1));
    if (title) await ov("title", s.title);
    await fn();
    if (DRY) await page.screenshot({ path: path.join(DIR, "shots", id + ".png") });
    await at(1);
    await sleep(pad);
  }
  const paperOf = (loc) => loc.locator("xpath=ancestor::div[contains(@class,'mantine-Paper-root')][1]");
  const pw = () => page.locator("input[type=password]");
  const cell = (row, col) => page.locator(`td[data-row="${row}"][data-col="${col}"]`);

  // ===================== SCENES =====================
  await scene("intro", async () => {
    await at(0.45);
    await ov("card", `<h1 style="font-size:44px">What we'll cover</h1><ul><li>Signing in</li><li>The dashboard</li><li>Making a quotation from an enquiry</li><li>Print, PDF &amp; email</li><li>Orders, lost quotations &amp; the list</li></ul>`);
    await at(0.97);
    await ov("card", null);
  }, { title: false, pad: 900 });

  await scene("signin", async () => {
    await at(0.3);
    await click(page.getByLabel("Username"), { after: 200 });
    await typeSlow("taher", 110);
    await click(pw().first(), { after: 200 });
    await typeSlow("amber-river-4821", 60);
    await at(0.85);
    await click(page.getByRole("button", { name: "Sign In" }), { after: 900 });
  });

  await scene("setpw", async () => {
    await page.getByText("Set Your Password").waitFor();
    await at(0.25);
    await click(pw().nth(0), { after: 150 }); await typeSlow("amber-river-4821", 40);
    await click(pw().nth(1), { after: 150 }); await typeSlow("Taher@Mogul26", 60);
    await click(pw().nth(2), { after: 150 }); await typeSlow("Taher@Mogul26", 60);
    await at(0.62);
    await click(page.getByRole("button", { name: "Save Password" }), { after: 1200 });
  });

  await scene("dash", async () => {
    await page.getByText("Follow-Up Required").waitFor();
    await sleep(300);
    await hl(paperOf(page.getByText("Quoted Value excl. VAT")));
    await at(0.25);
    await hl(paperOf(page.getByText("Orders Received excl. VAT")));
    await at(0.38);
    await hl(paperOf(page.getByText("Win Rate", { exact: true })));
    await at(0.47);
    await hl(paperOf(page.getByText("Awaiting Response", { exact: true })));
    await at(0.66);
    await hl(null);
    await click(page.getByText("3 Months", { exact: true }), { after: 800 });
    await click(page.getByText("12 Months", { exact: true }), { after: 800 });
    await click(page.getByText("4 Weeks", { exact: true }));
  });

  await scene("dash2", async () => {
    await hl(paperOf(page.getByText("Follow-Up Required")));
    await at(0.3);
    await hl(null);
    await scrollIntoMid("text=Quoted Value by Customer (AED)", 900);
    await hl(paperOf(page.getByText("Lost Value by Reason (AED)")));
    await at(0.5);
    await hl(null);
    await scrollIntoMid("text=Largest Quotations", 900);
    await hl(paperOf(page.getByText("Largest Quotations")));
    await at(0.7);
    await hl(null);
    await moveTo(page.getByText("Sales Rep", { exact: true }).last());
  });

  await scene("nav", async () => {
    await scrollTo(0, 600);
    const nav = page.locator("nav");
    await hl(nav.getByRole("link", { name: "New Quotation" }));
    await moveTo(nav.getByRole("link", { name: "New Quotation" }), { ms: 450 });
    await hl(null);
    for (const n of ["Dashboard", "Quotations", "Customers"]) await moveTo(nav.getByRole("link", { name: n, exact: true }), { ms: 450 });
    await at(0.4);
    await click(page.getByRole("button", { name: "Account" }), { after: 500 });
    await hl(page.getByRole("menu"));
    await at(0.8);
    await hl(null);
    await page.keyboard.press("Escape");
    await click(nav.getByRole("link", { name: "New Quotation" }), { after: 800 });
  });

  const custBox = () => page.getByPlaceholder("Search").first();
  await scene("cust", async () => {
    await click(custBox());
    await at(0.12);
    await typeSlow("star", 160);
    await at(0.28);
    await click(page.getByRole("option", { name: /STAR SUPER CEMENT/ }), { after: 700 });
    await ov("cursor", 1150, 700, 600);
    await hl(page.getByLabel("Address"));
    await sleep(900);
    await hl(paperOf(page.getByText("Terms", { exact: true })));
    await at(0.9);
    await hl(null);
  });

  await scene("newcust", async () => {
    await click(custBox(), { after: 700 });
    await moveTo(page.getByRole("option", { name: /New Customer/ }));
    await at(0.3);
    await click(page.getByRole("option", { name: /New Customer/ }), { after: 900 });
    await at(0.88);
    await click(page.getByRole("dialog").getByRole("button", { name: "Cancel" }), { after: 400 });
  });

  await scene("header", async () => {
    await hl(page.getByLabel("Enquiry Reference"));
    await moveTo(page.getByLabel("Enquiry Reference"));
    await at(0.3);
    await hl(page.getByLabel("Sales Rep").first());
    await moveTo(page.getByLabel("Sales Rep").first());
    await at(0.55);
    await hl(page.getByLabel("Quotation Date"));
    await at(0.75);
    await hl(page.getByLabel("Attention"));
    await moveTo(page.getByLabel("Attention"));
    await at(0.97);
    await hl(null);
  });

  // Excel mock
  const rows = PASTE.split("\n").map((l) => l.split("\t"));
  const xlHtml = `<div class="bar">Enquiry SSD2600041.xlsx — Excel</div><table>` +
    rows.map((r, i) => `<tr data-r="${i}"><td class="h">${i + 1}</td>${[0, 1, 2, 3, 4, 5].map((c) => `<td${i === 1 ? ' style="font-weight:700"' : ""}>${r[c] || ""}</td>`).join("")}</tr>`).join("") + `</table>`;

  await scene("paste1", async () => {
    await scrollIntoMid("text=Line Items", 900);
    await hl(paperOf(page.getByText("Line Items", { exact: true })).or(page.locator("[data-line-grid]")).first());
    await at(0.22);
    await hl(null);
    await ov("xl", xlHtml, true);
    await sleep(700);
    for (let r = 1; r < rows.length; r++) { await ov("xlSel", 1, r); await sleep(130); }
    await ov("cursor", 900, 560, 600);
    await at(0.6);
    await ov("keys", ["Ctrl", "C"], 1200);
    await sleep(1300);
    await page.evaluate(async (t) => {
      const html = "<table>" + t.split("\n").map((l) => "<tr>" + l.split("\t").map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</table>";
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([t], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]);
    }, PASTE);
    await ov("xl", null, false);
    await at(0.86);
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
    await ov("keys", ["Ctrl", "V"], 1500);
    await sleep(250);
    await page.keyboard.press("Control+V");
    try { await page.getByText("Import Preview").waitFor({ timeout: 1500 }); }
    catch {
      await page.evaluate((t) => { const dt = new DataTransfer(); dt.setData("text/plain", t); document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true })); }, PASTE);
      await page.getByText("Import Preview").waitFor({ timeout: 3000 });
    }
  });

  await scene("paste2", async () => {
    const dlg = page.getByRole("dialog");
    await sleep(400);
    await hl(dlg.getByText("Column Mapping", { exact: true }).locator("xpath=.."));
    await at(0.3);
    await hl(dlg.locator("table"));
    await at(0.45);
    await moveTo(dlg.getByText("MOTOR SPARES"));
    await at(0.6);
    await hl(dlg.getByText(/Enquiry Reference to/).locator("xpath=ancestor::div[contains(@class,'mantine-Alert-root')]"));
    await at(0.72);
    await hl(null);
    await moveTo(dlg.locator("select, .mantine-Select-input, .mantine-NativeSelect-input").nth(1));
    await at(0.9);
    await click(dlg.getByRole("button", { name: /Add \d+ lines/ }), { after: 900 });
  });

  await scene("pdf", async () => {
    await sleep(300);
    const imp = page.getByText("Import File: drop or click");
    await hl(imp);
    await moveTo(imp);
    await at(0.2);
    await hl(null);
    await ov("ripple", cx, cy);
    const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.mouse.click(cx, cy)]);
    await fc.setFiles(path.join(DIR, "ESF-1107 RFQ.pdf"));
    await page.getByText("Original Document").waitFor({ timeout: 30000 });
    await sleep(600);
    await hl(paperOf(page.getByText("Original Document")).or(page.getByText("Original Document").locator("xpath=../..")).first());
    await at(0.6);
    await hl(page.getByRole("dialog").locator("table"));
    await at(0.85);
    await hl(null);
    await click(page.getByRole("dialog").getByRole("button", { name: "Cancel" }), { after: 500 });
  });

  await scene("rates", async () => {
    // focus the first rate cell (Carbon brush, row 1)
    await click(cell(1, 3), { after: 300 });
    await at(0.2);
    for (const r of ["18.50", "245", "112", "26.75"]) {
      await typeSlow(r, 130);
      await sleep(200);
      await ov("keys", ["Enter"], 650);
      await page.keyboard.press("Enter");
      await sleep(600);
    }
    await at(0.7);
    await hl(paperOf(page.getByText("Totals (AED)")));
    await at(0.85);
    await hl(page.getByText(/without rate/).first());
    await at(0.98);
    await hl(null);
  });

  await scene("grid", async () => {
    await click(cell(2, 0), { after: 300 });
    for (const k of ["ArrowRight", "ArrowRight", "ArrowDown", "ArrowRight"]) { await ov("keys", [k.replace("Arrow", "")], 500); await page.keyboard.press(k); await sleep(450); }
    await at(0.3);
    const menuBtn = page.locator('tr:has(td[data-row="5"]) [aria-label="Row actions"]');
    await click(menuBtn, { after: 600 });
    for (const n of ["Insert Line Above", "Insert Section Above", "Duplicate", "Move Up", "Delete Line"]) {
      const it = page.getByRole("menuitem", { name: new RegExp("^" + n, "i") });
      if (await it.count()) await moveTo(it, { ms: 350 });
    }
    await page.keyboard.press("Escape");
    await at(0.62);
    // the copper line has no rate: Ctrl+D copies the rate above, then type the right one
    await click(cell(6, 3), { after: 300 });
    await keys(["Ctrl", "D"], "Control+D", 900);
    await at(0.82);
    await typeSlow("14.20", 120);
    await page.keyboard.press("Enter");
    await sleep(300);
  });

  await scene("notes", async () => {
    await scrollIntoMid("text=Remarks", 800);
    await click(page.getByLabel("Remarks"), { after: 150 });
    await typeSlow("Brands as specified. Delivery within 2–3 weeks from PO.", 30);
    await click(page.getByLabel("Internal Notes"), { after: 150 });
    await typeSlow("Bearings: check stock with SKF dealer.", 30);
  });

  await scene("save", async () => {
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await scrollTo(0, 700);
    await moveTo(page.getByRole("button", { name: "Save", exact: true }));
    await at(0.15);
    await keys(["Ctrl", "S"], "Control+S", 900);
    await page.getByRole("heading", { name: /ME-26-\d+/ }).waitFor();
    await hl(page.getByRole("heading", { name: /ME-26-\d+/ }));
    await at(0.85);
    await hl(null);
  });

  await scene("workings", async () => {
    const wk = page.locator("[data-workings]");
    await hl(wk);
    await at(0.3);
    await moveTo(wk.getByText("Add File"));
    await ov("ripple", cx, cy);
    await wk.locator('input[type="file"]').setInputFiles(path.join(DIR, "working.png"));
    await sleep(1500);
    await hl(wk);
    await at(0.9);
    await hl(null);
  });

  await scene("print", async () => {
    await click(page.getByRole("button", { name: "Print / PDF" }), { after: 1200 });
    await page.locator(".paper-wrap").waitFor();
    await at(0.15);
    await ov("cursor", 1000, 600, 600);
    await scrollIntoMid(".paper-wrap", 1200);
    await at(0.35);
    const docH = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    await scrollTo(docH, 3500);
    await at(0.6);
    await scrollTo(0, 1200);
    await hl(page.getByRole("button", { name: "Print / Save as PDF" }));
    await moveTo(page.getByRole("button", { name: "Print / Save as PDF" }));
    await at(0.82);
    await at(0.98);
    await hl(null);
  });

  await scene("email", async () => {
    await click(page.getByRole("button", { name: "Email", exact: true }), { after: 800 });
    const dlg = page.getByRole("dialog");
    await hl(dlg.getByLabel("To"), 800);
    await hl(dlg.getByLabel("Subject"), 800);
    await hl(dlg.getByLabel("Message"));
    await at(0.5);
    await hl(dlg.getByRole("button", { name: "Open in Outlook" }));
    await moveTo(dlg.getByRole("button", { name: "Open in Outlook" }));
    await at(0.92);
    await hl(null);
    await click(dlg.getByRole("button", { name: "Cancel" }), { after: 400 });
    await click(page.getByRole("link", { name: /^Back to ME-26/ }), { after: 1000 });
  });

  await scene("lost", async () => {
    await hl(paperOf(page.getByText("Order Status", { exact: true })));
    await at(0.2);
    await hl(null);
    await click(page.getByRole("button", { name: "Mark as Lost" }), { after: 700 });
    const dlg = page.getByRole("dialog");
    await at(0.4);
    await click(dlg.getByText("Price", { exact: true }), { after: 400 });
    await click(dlg.getByLabel("Notes"), { after: 150 });
    await typeSlow("Competitor 5% lower", 50);
    await at(0.8);
    await hl(dlg);
    await sleep(900);
    await hl(null);
    await click(dlg.getByRole("button", { name: "Cancel" }), { after: 400 });
  });

  await scene("order", async () => {
    await click(page.getByRole("button", { name: "Record Order" }), { after: 800 });
    const dlg = page.getByRole("dialog");
    await click(dlg.getByLabel("PO Number"), { after: 150 });
    await typeSlow("SSC/PO/26/1187", 70);
    await moveTo(dlg.getByLabel("PO Date"));
    await at(0.35);
    await click(dlg.getByRole("button", { name: "Select All" }), { after: 500 });
    await hl(dlg.locator("table"));
    await at(0.62);
    await hl(null);
    // the customer ordered fewer V-belts
    const qty = dlg.locator("table input").nth(0);
    if (await qty.count()) { await moveTo(qty); }
    await at(0.8);
    await click(dlg.getByRole("button", { name: "Save", exact: true }), { after: 1000 });
    await hl(paperOf(page.getByText(/Order Status/).first()));
    await at(0.98);
    await hl(null);
  });

  await scene("more", async () => {
    await click(page.getByRole("button", { name: "More actions" }), { after: 600 });
    await at(0.15);
    await moveTo(page.getByRole("menuitem", { name: /Create Revision/ }), { ms: 400 });
    await at(0.5);
    await moveTo(page.getByRole("menuitem", { name: /Duplicate as New Quotation/ }), { ms: 400 });
    await at(0.72);
    const cancelQ = page.getByRole("menuitem", { name: /Cancel Quotation/ });
    if (await cancelQ.count()) await moveTo(cancelQ, { ms: 400 });
    await at(0.95);
    await page.keyboard.press("Escape");
  });

  await scene("list", async () => {
    await click(page.locator("nav").getByRole("link", { name: "Quotations", exact: true }), { after: 900 });
    const s = page.getByLabel("Search");
    await click(s, { after: 200 });
    await typeSlow("bearing", 140);
    await sleep(1000);
    await at(0.35);
    await s.fill("");
    await sleep(400);
    await hl(page.getByLabel("Status"));
    await click(page.getByLabel("Status"), { after: 500 });
    await click(page.getByRole("option", { name: "Won" }), { after: 1000 });
    await hl(null);
    await at(0.62);
    await hl(page.getByText(/^Ordered/).first());
    await at(0.75);
    await hl(null);
    const clr = page.getByLabel("Status").locator("xpath=..").locator("button");
    if (await clr.count()) await click(clr.first(), { after: 400 });
    await hl(page.getByRole("button", { name: "Export to Excel" }));
    await moveTo(page.getByRole("button", { name: "Export to Excel" }));
    await at(0.97);
    await hl(null);
  });

  await scene("customers", async () => {
    await click(page.locator("nav").getByRole("link", { name: "Customers", exact: true }), { after: 900 });
    await hl(page.locator("table"));
    await at(0.3);
    await hl(null);
    await click(page.getByRole("cell", { name: "AL FUTTAIM ENGINEERING LLC" }), { after: 900 });
    await hl(page.getByRole("dialog").getByLabel("Payment terms").or(page.getByRole("dialog").getByLabel("Payment Terms")).first().locator("xpath=ancestor::div[contains(@class,'mantine-SimpleGrid-root')][1]"));
    await at(0.92);
    await hl(null);
    await click(page.getByRole("dialog").getByRole("button", { name: "Cancel" }), { after: 400 });
  });

  await scene("admin", async () => {
    // sign out, sign in as the admin
    await click(page.getByRole("button", { name: "Account" }), { after: 400 });
    await click(page.getByRole("menuitem", { name: "Sign Out" }), { after: 900 });
    await page.getByRole("button", { name: "Sign In" }).waitFor();
    await page.getByLabel("Username").fill("admin");
    await pw().first().fill("Admin#2026");
    await click(page.getByRole("button", { name: "Sign In" }), { after: 1000 });
    await page.locator("nav").getByRole("link", { name: "Users" }).waitFor();
    await click(page.locator("nav").getByRole("link", { name: "Users" }), { after: 900 });
    await at(0.45);
    await hl(page.locator("table"));
    await at(0.65);
    await hl(null);
    const rowMenu = page.locator("tr", { hasText: "taher" }).locator("button").last();
    await click(rowMenu, { after: 500 });
    await moveTo(page.getByRole("menuitem", { name: "Set Password" }), { ms: 400 });
    await at(0.95);
    await page.keyboard.press("Escape");
  });

  await scene("settings", async () => {
    await click(page.locator("nav").getByRole("link", { name: "Settings" }), { after: 900 });
    await hl(paperOf(page.getByText("Company Details")));
    await at(0.35);
    await hl(null);
    await scrollIntoMid("text=Quotation Defaults", 900);
    await hl(paperOf(page.getByText("Quotation Defaults")));
    await at(0.95);
    await hl(null);
  });

  await scene("outro", async () => {
    await ov("title", null);
    await ov("card", `<h1 style="font-size:48px">Quick recap</h1><ul><li>Pick the customer</li><li>Paste or import the items</li><li>Enter the rates, then Save</li><li>Print / PDF and email</li><li>Record the order, or why it was lost</li></ul>`);
    await at(0.85);
    await ov("card", `<div class="logo">ME</div><h1>Happy quoting!</h1><p>Mogul Electromech LLC</p>`);
  }, { title: false, pad: 2200 });

  fs.writeFileSync(path.join(DIR, "timeline.json"), JSON.stringify({ timeline, end: (Date.now() - T0) / 1000 }, null, 1));
  if (ff) { ff.stdin.write("q"); await new Promise((r) => ff.on("close", r)); }
  await browser.close();
  console.log("done");
})().catch(async (e) => { console.error(e); try { await global.__page.screenshot({ path: path.join(__dirname, "fail.png") }); } catch {} process.exit(1); });
