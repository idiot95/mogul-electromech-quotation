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

  // ---- warm up before recording ----
  await page.goto(BASE + "/");
  await page.waitForSelector("text=Largest quotes");
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await page.reload();
  await page.waitForSelector("text=Largest quotes");
  await sleep(1500);

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
  async function scene(id, fn, { pad = 700, title = true } = {}) {
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

  // ===================== SCENES =====================
  await scene("intro", async () => {
    await ov("card", `<div class="logo">ME</div><h1>Mogul Workspace</h1><p>Quotations · staff training</p>`);
    await at(0.42);
    await ov("card", `<h1 style="font-size:46px">What we'll cover</h1><ul><li>Home screen</li><li>Making a quote from an enquiry</li><li>Print, PDF &amp; email</li><li>Revisions &amp; the quotation list</li><li>Customers &amp; settings</li></ul>`);
    await at(0.97);
    await ov("card", null);
  }, { title: false, pad: 900 });

  await scene("home", async () => {
    await sleep(300);
    await hl(page.locator(".mantine-SimpleGrid-root").first());
    await moveTo(page.getByText("Quoted · excl. VAT"));
    await at(0.45);
    await hl(null);
    await click(page.getByText("3 months", { exact: true }), { after: 900 });
    await click(page.getByText("12 months", { exact: true }), { after: 900 });
    await click(page.getByText("4 weeks", { exact: true }));
  });

  await scene("home2", async () => {
    await hl(page.getByText("By customer (AED)").locator("xpath=.."));
    await at(0.3);
    await hl(null);
    await scrollIntoMid("text=Largest quotes", 1100);
    await hl(page.getByText("Largest quotes").locator("xpath=../.."));
    await at(0.75);
    await hl(null);
    await moveTo(page.locator("table a").first());
  });

  await scene("nav", async () => {
    await scrollTo(0, 600);
    for (const n of ["Home", "Quotations", "Customers", "Settings"]) await moveTo(page.locator("nav").getByText(n, { exact: true }), { ms: 450 });
    await at(0.62);
    await hl(page.locator("nav").getByRole("link", { name: "New quote" }));
    await at(0.82);
    await hl(null);
    await click(page.locator("nav").getByRole("link", { name: "New quote" }), { after: 600 });
  });

  const custBox = () => page.getByPlaceholder("Type to search customers…");
  await scene("cust", async () => {
    await click(custBox());
    await at(0.12);
    await typeSlow("star", 160);
    await at(0.3);
    await click(page.getByRole("option", { name: /STAR SUPER CEMENT/ }), { after: 700 });
    await page.mouse.move(1500, 900);
    await ov("cursor", 1500, 820, 600);
    await hl(page.getByText("Terms", { exact: true }).locator("xpath=../.."));
    await at(0.62);
    await hl(null);
    await moveTo(page.getByText("from customer").first());
    await at(0.85);
    await hl(page.getByText("Payment terms").locator("xpath=ancestor::div[contains(@class,'mantine-InputWrapper-root')]").first(), 1800);
  });

  await scene("newcust", async () => {
    await click(custBox(), { after: 700 });
    await moveTo(page.getByRole("option", { name: /New customer/ }));
    await at(0.35);
    await click(page.getByRole("option", { name: /New customer/ }), { after: 900 });
    await at(0.85);
    await click(page.getByRole("dialog").getByRole("button", { name: "Cancel" }), { after: 400 });
  });

  await scene("header", async () => {
    await click(page.getByLabel("2 · Enquiry reference"), { after: 200 });
    await page.keyboard.press("Escape");
    await at(0.25);
    await click(page.getByLabel("3 · Salesman"), { after: 500 });
    await click(page.getByRole("option", { name: "Taher" }), { after: 300 });
    await at(0.6);
    await moveTo(page.getByLabel("Date"));
    await at(0.75);
    const att = page.getByLabel("Kind attention");
    await click(att, { after: 150 });
    await att.fill("");
    await typeSlow("Mr. Suresh Menon (Purchase)", 55);
  });

  // Excel mock
  const rows = PASTE.split("\n").map((l) => l.split("\t"));
  const xlHtml = `<div class="bar">Enquiry SSD2600041.xlsx — Excel</div><table>` +
    rows.map((r, i) => `<tr data-r="${i}"><td class="h">${i + 1}</td>${[0, 1, 2, 3, 4, 5].map((c) => `<td${i === 1 ? ' style="font-weight:700"' : ""}>${r[c] || ""}</td>`).join("")}</tr>`).join("") + `</table>`;

  await scene("paste1", async () => {
    await scrollIntoMid("text=4 · Paste items", 900);
    await hl(page.getByText("4 · Paste items").locator("xpath=ancestor::div[contains(@class,'mantine-Paper-root')]").first());
    await at(0.22);
    await hl(null);
    await ov("xl", xlHtml, true);
    await sleep(700);
    for (let r = 1; r < rows.length; r++) { await ov("xlSel", 1, r); await sleep(140); }
    await ov("cursor", 1150, 640, 600);
    await at(0.55);
    await ov("keys", ["Ctrl", "C"], 1300);
    await sleep(1500);
    await page.evaluate(async (t) => {
      const html = "<table>" + t.split("\n").map((l) => "<tr>" + l.split("\t").map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</table>";
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([t], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]);
    }, PASTE);
    await ov("xl", null, false);
    await at(0.82);
    // focus the page body (not an input), then Ctrl+V
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
    await ov("keys", ["Ctrl", "V"], 1500);
    await sleep(250);
    await page.keyboard.press("Control+V");
    try { await page.getByText("Paste preview").waitFor({ timeout: 1500 }); }
    catch {
      await page.evaluate((t) => { const dt = new DataTransfer(); dt.setData("text/plain", t); document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true })); }, PASTE);
      await page.getByText("Paste preview").waitFor({ timeout: 3000 });
    }
  });

  await scene("paste2", async () => {
    const dlg = page.getByRole("dialog");
    await sleep(500);
    await hl(dlg.getByText("Column mapping · change any").locator("xpath=.."));
    await at(0.3);
    await hl(dlg.locator("table"));
    await at(0.42);
    await moveTo(dlg.getByText("MOTOR SPARES"));
    await at(0.5);
    await hl(dlg.getByText("Enquiry reference found").locator("xpath=ancestor::div[contains(@class,'mantine-Alert-root')]"));
    await at(0.66);
    await hl(null);
    await moveTo(dlg.locator("select").nth(1));
    await at(0.85);
    await click(dlg.getByRole("button", { name: /Add \d+ lines/ }), { after: 900 });
  });

  await scene("email-paste", async () => {
    await sleep(400);
    await hl(page.getByRole("button", { name: "Import .xlsx / .csv" }));
    await moveTo(page.getByRole("button", { name: "Import .xlsx / .csv" }));
    await at(0.6);
    await hl(null);
    await hl(page.locator("table.grid, table").filter({ has: page.locator('[data-col="rate"]') }).first());
    await at(0.95);
    await hl(null);
  });

  await scene("rates", async () => {
    const rateCells = page.locator('[data-col="rate"]');
    const first = await page.locator('[data-col="rate"]:focus').count();
    if (!first) await click(rateCells.nth(0));
    await at(0.2);
    for (const r of ["18.50", "245", "112", "26.75"]) {
      await typeSlow(r, 140);
      await sleep(250);
      await ov("keys", ["Enter"], 700);
      await page.keyboard.press("Enter");
      await sleep(700);
    }
    await at(0.62);
    await hl(page.getByText(/Totals \(/).locator("xpath=.."));
    await at(0.78);
    await hl(page.getByText(/has no rate|have no rate/));
    await at(0.97);
    await hl(null);
  });

  await scene("grid", async () => {
    // menu on the V-Belt line
    const row = page.locator("tr").filter({ has: page.locator('[data-col="rate"]') }).filter({ hasText: "" });
    const menuBtn = page.getByRole("button", { name: "Row actions" }).nth(5);
    await moveTo(page.locator('[data-col="description"]').nth(5));
    await click(menuBtn, { after: 600 });
    await at(0.28);
    await moveTo(page.getByRole("menuitem", { name: "Insert heading above" }), { ms: 400 });
    await moveTo(page.getByRole("menuitem", { name: "Duplicate" }), { ms: 400 });
    await moveTo(page.getByRole("menuitem", { name: "Move up" }), { ms: 400 });
    await moveTo(page.getByRole("menuitem", { name: "Delete line" }), { ms: 400 });
    await page.keyboard.press("Escape");
    await at(0.45);
    await moveTo(page.locator(".grip").nth(4));
    await at(0.6);
    // the last copper line has no rate: fill it from the line above with Ctrl+D
    const last = page.locator('[data-col="rate"]').nth(4);
    await click(last, { after: 300 });
    await keys(["Ctrl", "D"], "Control+D", 800);
    await at(0.8);
    await moveTo(page.getByRole("button", { name: "Undo" }));
    await sleep(500);
    // put the right rate in
    await click(last, { after: 200 });
    await page.keyboard.press("Control+A");
    await typeSlow("14.20", 120);
  });

  await scene("notes", async () => {
    await scrollIntoMid("text=Remarks", 800);
    const rem = page.getByLabel(/^Remarks/);
    await click(rem, { after: 150 });
    await typeSlow("Brands as specified. Delivery within 2–3 weeks from PO.", 32);
    const inn = page.getByLabel(/^Internal notes/);
    await click(inn, { after: 150 });
    await typeSlow("Bearings: check stock with SKF dealer.", 32);
  });

  await scene("save", async () => {
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await scrollTo(0, 800);
    await moveTo(page.getByRole("button", { name: /^Save/ }));
    await at(0.15);
    await keys(["Ctrl", "S"], "Control+S", 900);
    await page.getByRole("heading", { name: /ME-26-\d+/ }).waitFor();
    await hl(page.getByRole("heading", { name: /ME-26-\d+/ }));
    await at(0.7);
    await hl(null);
  });

  // a "working" image to attach
  await scene("workings", async () => {
    await hl(page.getByText("Workings", { exact: true }).locator("xpath=ancestor::div[contains(@class,'mantine-Paper-root')]").first());
    await at(0.3);
    await moveTo(page.getByText("Drop or tap to add a photo / file"));
    await ov("ripple", cx, cy);
    await page.locator('input[type="file"]').last().setInputFiles(path.join(DIR, "working.png"));
    await sleep(1500);
    await hl(page.getByText("Workings", { exact: true }).locator("xpath=ancestor::div[contains(@class,'mantine-Paper-root')]").first());
    await at(0.9);
    await hl(null);
  });

  await scene("print", async () => {
    await click(page.getByRole("button", { name: "Print / Save as PDF" }), { after: 1200 });
    await page.locator(".paper-wrap").waitFor();
    await at(0.2);
    await ov("cursor", 1200, 700, 600);
    await scrollIntoMid(".paper-wrap", 1500);
    await at(0.45);
    const docH = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    await scrollTo(docH, 4000);
    await at(0.62);
    await scrollTo(0, 1500);
    await moveTo(page.getByRole("button", { name: "Print / Save as PDF" }));
    await hl(page.getByRole("button", { name: "Print / Save as PDF" }));
    await at(0.82);
    await hl(page.locator("code").first());
    await at(0.98);
    await hl(null);
  });

  await scene("email", async () => {
    await click(page.getByRole("button", { name: "Email via Outlook" }), { after: 800 });
    const dlg = page.getByRole("dialog");
    await hl(dlg.getByLabel("To"), 900);
    await hl(dlg.getByLabel("Subject"), 900);
    await hl(dlg.getByLabel("Message"));
    await at(0.42);
    await hl(null);
    await moveTo(dlg.getByRole("button", { name: "Open in Outlook" }));
    await hl(dlg.getByRole("button", { name: "Open in Outlook" }));
    await at(0.68);
    await hl(dlg.getByText("Attach the PDF").locator("xpath=ancestor::div[contains(@class,'mantine-Alert-root')]"));
    await at(0.92);
    await hl(null);
    await click(dlg.getByRole("button", { name: "Cancel" }));
  });

  await scene("revise", async () => {
    await click(page.getByRole("link", { name: "Back to editor" }), { after: 900 });
    await click(page.getByRole("button", { name: /Revise \(REV 01\)/ }), { after: 700 });
    await at(0.25);
    await click(page.getByRole("dialog").getByRole("button", { name: "Create revision" }), { after: 1200 });
    await page.getByRole("heading", { name: /REV 01/ }).waitFor();
    await hl(page.getByRole("heading", { name: /REV 01/ }));
    await at(0.55);
    await hl(page.getByText("Revisions", { exact: true }).locator("xpath=ancestor::div[contains(@class,'mantine-Paper-root')]").first());
    await at(0.8);
    await hl(null);
    await click(page.getByRole("link", { name: /ME-26-\d+$/ }).last(), { after: 900 });
    await hl(page.getByText("This revision was replaced").locator("xpath=ancestor::div[contains(@class,'mantine-Alert-root')]"));
    await at(0.96);
    await hl(null);
    await click(page.getByRole("link", { name: "Open the latest revision →" }), { after: 600 });
  });

  await scene("more", async () => {
    await page.getByRole("heading", { name: /REV 01/ }).waitFor();
    await hl(page.getByRole("button", { name: "Duplicate as new quote" }));
    await moveTo(page.getByRole("button", { name: "Duplicate as new quote" }));
    await at(0.33);
    await hl(page.getByRole("button", { name: "Cancel quote" }));
    await moveTo(page.getByRole("button", { name: "Cancel quote" }));
    await at(0.66);
    await hl(page.getByRole("button", { name: "Delete draft" }));
    await moveTo(page.getByRole("button", { name: "Delete draft" }));
    await at(0.95);
    await hl(null);
  });

  await scene("list", async () => {
    await click(page.locator("nav").getByText("Quotations", { exact: true }), { after: 900 });
    const s = page.getByLabel("Search");
    await click(s, { after: 200 });
    await typeSlow("bearing", 150);
    await sleep(1200);
    await at(0.3);
    await s.fill("");
    await sleep(500);
    await click(page.getByLabel("Salesman"), { after: 500 });
    await click(page.getByRole("option", { name: "Taher" }), { after: 1100 });
    await at(0.52);
    const clr = page.getByLabel("Salesman").first().locator("xpath=..").locator("button");
    if (await clr.count()) await click(clr.first(), { after: 300 }); else await page.goto(BASE + "/quotes");
    await sleep(500);
    await at(0.6);
    await click(page.getByLabel("Show replaced revisions"), { after: 900 });
    await at(0.8);
    await hl(page.getByRole("button", { name: "Export CSV" }));
    await moveTo(page.getByRole("button", { name: "Export CSV" }));
    await at(0.97);
    await hl(null);
  });

  await scene("customers", async () => {
    await click(page.locator("nav").getByText("Customers", { exact: true }), { after: 900 });
    await hl(page.locator("table"));
    await at(0.3);
    await hl(null);
    await click(page.getByRole("cell", { name: "AL FUTTAIM ENGINEERING LLC" }), { after: 900 });
    await hl(page.getByText("Default terms · copied onto every new quote").locator("xpath=../.."));
    await at(0.72);
    await hl(null);
    await click(page.getByRole("dialog").getByRole("button", { name: "Cancel" }), { after: 500 });
    await hl(page.getByRole("button", { name: "Import Excel / CSV" }));
    await moveTo(page.getByRole("button", { name: "Import Excel / CSV" }));
    await at(0.97);
    await hl(null);
  });

  await scene("settings", async () => {
    await click(page.locator("nav").getByText("Settings", { exact: true }), { after: 900 });
    await hl(page.getByText("Company · letterhead").locator("xpath=ancestor::div[contains(@class,'mantine-Paper-root')]").first());
    await at(0.2);
    await hl(null);
    await scrollIntoMid("text=Number prefix", 1000);
    await hl(page.getByText("Quotations", { exact: true }).locator("xpath=ancestor::div[contains(@class,'mantine-Paper-root')]").last());
    await at(0.55);
    await hl(null);
    await scrollIntoMid("text=Add salesman", 1000);
    await at(0.68);
    await click(page.getByRole("cell", { name: "Taher", exact: true }), { after: 900 });
    await hl(page.getByRole("dialog").getByLabel("Email template"));
    await at(0.97);
    await hl(null);
    await click(page.getByRole("dialog").getByRole("button", { name: "Cancel" }));
  });

  await scene("outro", async () => {
    await ov("title", null);
    await ov("card", `<h1 style="font-size:50px">Quick recap</h1><ul><li>Pick the customer</li><li>Paste the items (Ctrl + V)</li><li>Enter the rates</li><li>Save (Ctrl + S)</li><li>Print / PDF, then email</li></ul>`);
    await at(0.82);
    await ov("card", `<div class="logo">ME</div><h1>Happy quoting!</h1><p>Mogul Electromech LLC</p>`);
  }, { title: false, pad: 2200 });

  fs.writeFileSync(path.join(DIR, "timeline.json"), JSON.stringify({ timeline, end: (Date.now() - T0) / 1000 }, null, 1));
  if (ff) { ff.stdin.write("q"); await new Promise((r) => ff.on("close", r)); }
  await browser.close();
  console.log("done");
})().catch(async (e) => { console.error(e); try { await global.__page.screenshot({ path: path.join(DIR, "fail.png") }); } catch {} process.exit(1); });
