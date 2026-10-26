import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router";
import { api } from "../../lib/api";
import type { Customer, Quote, QuoteHeader } from "../../lib/types";
import { dateFmt, money, quoteNo, todayUAE } from "../../lib/format";
import { useApp } from "../../core/app-context";
import { CustomerForm } from "../../core/CustomerForm";
import { readSheetFile } from "../../lib/sheets";
import type { PasteInput } from "../../../../shared/paste-engine";
import { LineGrid, type GridApi } from "./LineGrid";
import { PastePreview, type PasteMode } from "./PastePreview";
import { blankLine, computeTotals, fromLines, fromParsed, isBlank, toLines, type EditLine } from "./lines";
import { CustomerPicker } from "./CustomerPicker";
import { Workings } from "./Workings";
import { EmailDialog } from "./EmailDialog";
import { StatusPill } from "./QuoteList";

const LAST_SALESMAN = "mogul.lastSalesman";

function emptyHeader(): QuoteHeader {
  let sm: number | null = null;
  try {
    sm = Number(localStorage.getItem(LAST_SALESMAN)) || null;
  } catch {
    /* storage unavailable */
  }
  return {
    quote_date: todayUAE(),
    customer_id: null,
    customer_name: "",
    customer_address: null,
    attention: null,
    enquiry_ref: null,
    salesman_id: sm,
    payment_terms: null,
    validity: null,
    delivery_terms: null,
    vat_terms: null,
    vat_rate: 5,
    notes: null,
    internal_notes: null,
  };
}

export function QuoteEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { settings, salesmen, toast } = useApp();
  const cfg = settings?.quotes;
  const defaultUnit = cfg?.defaultUnit || "Nos.";

  const [quote, setQuote] = useState<Quote | null>(null);
  const [h, setH] = useState<QuoteHeader>(emptyHeader);
  const [lines, setLines] = useState<EditLine[]>([blankLine(defaultUnit)]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [history, setHistory] = useState<EditLine[][]>([]);
  const [paste, setPaste] = useState<{ input: PasteInput; row: number | null } | null>(null);
  const [newCust, setNewCust] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const gridRef = useRef<GridApi | null>(null);
  const lastStructural = useRef(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const readOnly = !!quote?.superseded_by;
  const selectedCustomer = customers.find((c) => c.id === h.customer_id) || null;

  // ---------- load ----------
  useEffect(() => {
    api.get<Customer[]>("/customers?all=1").then(setCustomers, (e) => toast(e.message, true));
  }, []);

  useEffect(() => {
    if (!id) {
      setQuote(null);
      setH({ ...emptyHeader(), vat_rate: cfg?.vatRate ?? 5 });
      setLines([blankLine(defaultUnit)]);
      setHistory([]);
      setDirty(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get<Quote>(`/quotes/${id}`)
      .then((q) => applyQuote(q))
      .catch((e) => toast(e.message, true))
      .finally(() => setLoading(false));
  }, [id]);

  function applyQuote(q: Quote) {
    setQuote(q);
    const { quote_date, customer_id, customer_name, customer_address, attention, enquiry_ref, salesman_id, payment_terms, validity, delivery_terms, vat_terms, vat_rate, notes, internal_notes } = q;
    setH({ quote_date, customer_id, customer_name, customer_address, attention, enquiry_ref, salesman_id, payment_terms, validity, delivery_terms, vat_terms, vat_rate, notes, internal_notes });
    const ls = fromLines(q.lines);
    setLines(q.superseded_by ? ls : [...ls, blankLine(defaultUnit)]);
    setHistory([]);
    setDirty(false);
  }

  // ---------- edits ----------
  const setField = <K extends keyof QuoteHeader>(k: K, v: QuoteHeader[K]) => {
    setH((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const changeLines = useCallback((next: EditLine[], structural: boolean) => {
    setLines((prev) => {
      if (structural) setHistory((hs) => [...hs.slice(-30), prev]);
      return next;
    });
    lastStructural.current = structural;
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    setHistory((hs) => {
      if (!hs.length) return hs;
      setLines(hs[hs.length - 1]);
      return hs.slice(0, -1);
    });
    lastStructural.current = false;
    setDirty(true);
  }, []);

  function pickCustomer(c: Customer) {
    setH((p) => ({
      ...p,
      customer_id: c.id,
      customer_name: c.name,
      customer_address: c.address,
      attention: c.contact_person || p.attention,
      payment_terms: c.payment_terms || cfg?.paymentTerms || null,
      validity: c.validity || cfg?.validity || null,
      delivery_terms: c.delivery_terms || cfg?.deliveryTerms || null,
      vat_terms: c.vat_terms || cfg?.vatTerms || null,
    }));
    setDirty(true);
  }

  function applyPaste(items: Parameters<typeof fromParsed>[0], mode: PasteMode, enquiry: string | null) {
    const incoming = fromParsed(items, defaultUnit);
    const kept = lines.filter((l) => !isBlank(l));
    let next: EditLine[];
    let firstNew: number;
    if (mode === "replace" || !kept.length) {
      next = incoming;
      firstNew = 0;
    } else if (mode === "insert" && paste?.row != null) {
      const at = Math.min(paste.row, lines.length);
      const before = lines.slice(0, at).filter((l) => !isBlank(l));
      const after = lines.slice(at).filter((l) => !isBlank(l));
      next = [...before, ...incoming, ...after];
      firstNew = before.length;
    } else {
      next = [...kept, ...incoming];
      firstNew = kept.length;
    }
    next.push(blankLine(defaultUnit));
    changeLines(next, true);
    if (enquiry) setField("enquiry_ref", enquiry);
    setPaste(null);
    const firstItem = next.findIndex((l, i) => i >= firstNew && l.kind === "item");
    setTimeout(() => gridRef.current?.focusCell(firstItem >= 0 ? firstItem : firstNew, "rate"), 30);
    const n = incoming.filter((l) => l.kind === "item").length;
    toast(`${n} line${n === 1 ? "" : "s"} added — enter the rates`);
  }

  async function onFile(file: File) {
    try {
      const rows = await readSheetFile(file);
      setPaste({ input: { rows }, row: null });
    } catch (e) {
      toast("Could not read the file: " + (e as Error).message, true);
    }
  }

  // ---------- save ----------
  const save = useCallback(async (): Promise<Quote | null> => {
    if (readOnly) return quote;
    if (!h.customer_name.trim()) {
      toast("Choose a customer first", true);
      return null;
    }
    setSaving(true);
    try {
      const payload = { ...h, lines: toLines(lines) };
      const saved = quote ? await api.put<Quote>(`/quotes/${quote.id}`, payload) : await api.post<Quote>("/quotes", payload);
      try {
        if (h.salesman_id) localStorage.setItem(LAST_SALESMAN, String(h.salesman_id));
      } catch {
        /* ignore */
      }
      setDirty(false);
      dirtyRef.current = false;
      if (!quote) {
        setQuote(saved);
        toast(`Saved as ${saved.base_number}`);
        navigate(`/quotes/${saved.id}`, { replace: true });
      } else {
        setQuote(saved);
        toast("Saved");
      }
      return saved;
    } catch (e) {
      toast((e as Error).message, true);
      return null;
    } finally {
      setSaving(false);
    }
  }, [h, lines, quote, readOnly]);

  // ---------- keyboard + page-level paste ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === "z" && history.length && lastStructural.current) {
        e.preventDefault();
        undo();
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      if (readOnly || paste) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable], .card[tabindex]")) return;
      const text = e.clipboardData?.getData("text/plain") || "";
      if (!text.trim()) return;
      const html = e.clipboardData?.getData("text/html") || "";
      e.preventDefault();
      setPaste({ input: { text, html: /<table/i.test(html) ? html : null }, row: null });
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("paste", onPaste);
    };
  }, [save, undo, history.length, readOnly, paste]);

  // ---------- unsaved-changes guard ----------
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRef.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (confirm("You have unsaved changes. Leave without saving?")) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker.state]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);

  // ---------- actions ----------
  async function act(path: string, body?: unknown, msg?: string) {
    if (dirty && !(await save())) return;
    try {
      const q = await api.post<Quote>(`/quotes/${quote!.id}${path}`, body);
      if (q.id !== quote!.id) navigate(`/quotes/${q.id}`);
      else applyQuote(q);
      if (msg) toast(msg);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  async function print() {
    const q = dirty || !quote ? await save() : quote;
    if (q) navigate(`/quotes/${q.id}/print`);
  }

  async function del() {
    if (!quote || !confirm(`Delete draft ${quoteNo(quote.base_number, quote.rev)}? This cannot be undone.`)) return;
    try {
      await api.del(`/quotes/${quote.id}`);
      setDirty(false);
      dirtyRef.current = false;
      toast("Draft deleted");
      navigate("/quotes");
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  if (loading || !cfg) return <div className="page"><div className="empty">Loading…</div></div>;

  const t = computeTotals(lines, Number(h.vat_rate) || 0);
  const fromCust = (k: "payment_terms" | "validity" | "delivery_terms" | "vat_terms") =>
    !!selectedCustomer && !!h[k] && selectedCustomer[k] === h[k] ? <span className="fc">from customer</span> : null;
  const latestRev = quote?.revisions[quote.revisions.length - 1];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="qno">
            {quote ? quoteNo(quote.base_number, quote.rev) : "New quotation"}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {quote ? <><StatusPill s={quote.status} /> · {dateFmt(quote.quote_date)}</> : "Number is given on first save"}
            {dirty && <span style={{ color: "var(--warn)" }}> · unsaved changes</span>}
          </div>
        </div>
        <span className="sp" />
        <div className="btn-row">
          <Link to="/quotes" className="btn ghost">← All quotes</Link>
          {!readOnly && <button className="btn p" onClick={() => save()} disabled={saving}>{saving ? "Saving…" : "Save"} <span className="kbd" style={{ background: "transparent", color: "inherit", borderColor: "rgba(255,255,255,.5)" }}>Ctrl+S</span></button>}
        </div>
      </div>

      {readOnly && latestRev && (
        <div className="banner warn">
          This revision was replaced. It is kept read-only for the record. <Link to={`/quotes/${latestRev.id}`}>Open the latest revision →</Link>
        </div>
      )}

      <div className="editor">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div className="card">
            <div className="grid2">
              <label className="f" style={{ gridColumn: "1 / -1" }}>
                <span>1 · Customer</span>
                <CustomerPicker
                  customers={customers}
                  value={h.customer_name}
                  selectedId={h.customer_id}
                  readOnly={readOnly}
                  onType={(v) => { setH((p) => ({ ...p, customer_name: v, customer_id: null })); setDirty(true); }}
                  onPick={pickCustomer}
                  onNew={(name) => setNewCust(name)}
                />
              </label>
              <label className="f">
                <span>2 · Enquiry reference</span>
                <input value={h.enquiry_ref || ""} readOnly={readOnly} onChange={(e) => setField("enquiry_ref", e.target.value)} />
              </label>
              <label className="f">
                <span>3 · Salesman</span>
                <select value={h.salesman_id ?? ""} disabled={readOnly} onChange={(e) => setField("salesman_id", Number(e.target.value) || null)}>
                  <option value="">— choose —</option>
                  {salesmen.filter((s) => s.active || s.id === h.salesman_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            </div>
            {h.customer_name && (
              <>
                <div className="grid2">
                  <label className="f"><span>Address (printed)</span>
                    <textarea rows={2} value={h.customer_address || ""} readOnly={readOnly} onChange={(e) => setField("customer_address", e.target.value)} />
                  </label>
                  <div className="grid2" style={{ gap: 12 }}>
                    <label className="f"><span>Kind attention</span><input value={h.attention || ""} readOnly={readOnly} onChange={(e) => setField("attention", e.target.value)} /></label>
                    <label className="f"><span>Date</span><input type="date" value={h.quote_date} readOnly={readOnly} onChange={(e) => setField("quote_date", e.target.value)} /></label>
                  </div>
                </div>
                <div className="grid2">
                  <label className="f"><span>Payment terms {fromCust("payment_terms")}</span><input value={h.payment_terms || ""} readOnly={readOnly} onChange={(e) => setField("payment_terms", e.target.value)} /></label>
                  <label className="f"><span>Quote validity {fromCust("validity")}</span><input value={h.validity || ""} readOnly={readOnly} onChange={(e) => setField("validity", e.target.value)} /></label>
                  <label className="f"><span>Delivery terms {fromCust("delivery_terms")}</span><input value={h.delivery_terms || ""} readOnly={readOnly} onChange={(e) => setField("delivery_terms", e.target.value)} /></label>
                  <label className="f"><span>VAT terms {fromCust("vat_terms")}</span><input value={h.vat_terms || ""} readOnly={readOnly} onChange={(e) => setField("vat_terms", e.target.value)} /></label>
                </div>
              </>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {!readOnly && (
              <div className="pastebar no-print">
                <b>4 · Paste items</b> — copy cells in Excel or a list from an email, then press <span className="kbd">Ctrl+V</span> anywhere on this page.
                <span className="muted">Then <b>5 · enter rates</b> — <span className="kbd">Enter</span> moves down.</span>
                <label className="btn sm" style={{ marginLeft: "auto" }}>
                  Import .xlsx / .csv
                  <input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { e.target.files?.[0] && onFile(e.target.files[0]); e.target.value = ""; }} />
                </label>
              </div>
            )}
            <LineGrid
              lines={lines}
              readOnly={readOnly}
              defaultUnit={defaultUnit}
              currency={quote?.currency || cfg.currency}
              onChange={changeLines}
              onBulkPaste={(input, row) => setPaste({ input, row })}
              onFileDrop={onFile}
              onUndo={undo}
              canUndo={history.length > 0}
              gridRef={gridRef}
            />
          </div>

          <div className="grid2">
            <label className="f"><span>Remarks (printed on the quote)</span><textarea rows={3} value={h.notes || ""} readOnly={readOnly} onChange={(e) => setField("notes", e.target.value)} /></label>
            <label className="f"><span>Internal notes (never printed)</span><textarea rows={3} value={h.internal_notes || ""} readOnly={readOnly} onChange={(e) => setField("internal_notes", e.target.value)} /></label>
          </div>
        </div>

        <aside className="editor-side">
          <div className="card">
            <div className="cap">Totals ({quote?.currency || cfg.currency})</div>
            <div className="totals">
              <span>Subtotal · {t.count} line{t.count === 1 ? "" : "s"}</span><b className="num">{money(t.subtotal)}</b>
              <span>VAT {h.vat_rate}%</span><span className="num">{money(t.vat)}</span>
              <span className="big">Total</span><span className="big num">{money(t.total)}</span>
            </div>
            {t.missingRate > 0 && <div className="warnline">{t.missingRate} line{t.missingRate === 1 ? " has" : "s have"} no rate</div>}
          </div>

          <div className="card">
            <div className="btn-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <button className="btn p" onClick={print} disabled={saving}>Print / Save as PDF</button>
              <button className="btn ink" disabled={!quote || saving} onClick={async () => { if (dirty && !(await save())) return; setEmailOpen(true); }}>Email via Outlook</button>
              {quote && !readOnly && (
                <button className="btn" onClick={() => confirm(`Create ${quoteNo(quote.base_number, (latestRev?.rev ?? quote.rev) + 1)}? The current version is kept read-only.`) && act("/revise", undefined, "Revision created")}>
                  Revise (REV {String((latestRev?.rev ?? quote.rev) + 1).padStart(2, "0")})
                </button>
              )}
              {quote && <button className="btn" onClick={() => act("/duplicate", undefined, "Copied to a new quote")}>Duplicate as new quote</button>}
              {quote && !readOnly && quote.status !== "cancelled" && (
                <button className="btn danger" onClick={() => confirm("Mark this quote as cancelled?") && act("/status", { status: "cancelled" }, "Marked cancelled")}>Mark cancelled</button>
              )}
              {quote && !readOnly && quote.status === "cancelled" && (
                <button className="btn" onClick={() => act("/status", { status: "draft" }, "Re-opened")}>Re-open</button>
              )}
              {quote && quote.status === "draft" && !readOnly && <button className="btn danger" onClick={del}>Delete draft</button>}
            </div>
          </div>

          <Workings quoteId={quote?.id ?? null} readOnly={readOnly} />

          {quote && quote.revisions.length > 1 && (
            <div className="card">
              <h3>Revisions</h3>
              {quote.revisions.map((r) => (
                <div key={r.id} className="btn-row" style={{ justifyContent: "space-between", fontSize: 14 }}>
                  {r.id === quote.id ? <b>{quoteNo(quote.base_number, r.rev)}</b> : <Link to={`/quotes/${r.id}`}>{quoteNo(quote.base_number, r.rev)}</Link>}
                  <span className="muted">{dateFmt(r.quote_date)}</span>
                  <span className="num">{money(r.total)}</span>
                </div>
              ))}
            </div>
          )}

          {quote && quote.emails.length > 0 && (
            <div className="card">
              <h3>Email log</h3>
              {quote.emails.map((m) => (
                <div key={m.id} style={{ fontSize: 13 }}>
                  <b>{m.created_at.slice(0, 16).replace("T", " ")}</b> · {m.sent_by || "—"} → {m.to_addr}
                  <div className="muted">{m.subject}</div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {paste && (
        <PastePreview
          input={paste.input}
          hasLines={lines.some((l) => !isBlank(l))}
          canInsert={paste.row != null && paste.row < lines.filter((l) => !isBlank(l)).length}
          enquiryEmpty={!h.enquiry_ref}
          onCancel={() => setPaste(null)}
          onConfirm={applyPaste}
        />
      )}
      {newCust !== null && (
        <CustomerForm
          initialName={newCust}
          onClose={() => setNewCust(null)}
          onSaved={(c) => {
            setCustomers((cs) => [...cs, c].sort((a, b) => a.name.localeCompare(b.name)));
            pickCustomer(c);
            setNewCust(null);
          }}
        />
      )}
      {emailOpen && quote && (
        <EmailDialog quote={quote} onClose={() => setEmailOpen(false)} onLogged={(q) => { applyQuote(q); setEmailOpen(false); }} onPrint={() => navigate(`/quotes/${quote.id}/print`)} />
      )}
    </div>
  );
}
