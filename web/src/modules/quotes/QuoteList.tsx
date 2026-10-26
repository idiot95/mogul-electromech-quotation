import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, qs } from "../../lib/api";
import type { QuoteListRow, QuoteStatus } from "../../lib/types";
import { dateFmt, money, quoteNo } from "../../lib/format";
import { useApp } from "../../core/app-context";

export function StatusPill({ s }: { s: QuoteStatus }) {
  return <span className={"pill " + s}>{s}</span>;
}

export function QuoteList() {
  const { salesmen, toast } = useApp();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [rows, setRows] = useState<QuoteListRow[] | null>(null);
  const q = sp.get("q") || "";
  const status = sp.get("status") || "";
  const salesman = sp.get("salesman_id") || "";
  const customer = sp.get("customer_id") || "";
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  const allRevs = sp.get("all_revisions") === "1";

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    setSp(n, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .get<QuoteListRow[]>("/quotes" + qs({ q, status, salesman_id: salesman, customer_id: customer, from, to, all_revisions: allRevs ? 1 : 0 }))
        .then(setRows, (e) => toast(e.message, true));
    }, 200);
    return () => clearTimeout(t);
  }, [q, status, salesman, customer, from, to, allRevs]);

  const total = rows?.filter((r) => r.status !== "cancelled").reduce((s, r) => s + r.subtotal, 0) ?? 0;

  function exportCsv() {
    if (!rows) return;
    const head = ["Number", "Date", "Customer", "Enquiry ref", "Salesman", "Status", "Lines", "Subtotal", "Total"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = rows.map((r) => [quoteNo(r.base_number, r.rev), r.quote_date, r.customer_name, r.enquiry_ref, r.salesman_name, r.status, r.line_count, r.subtotal, r.total].map(esc).join(","));
    const blob = new Blob([[head.join(","), ...body].join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quotations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Quotations</h1>
        <span className="sp" />
        <button className="btn" onClick={exportCsv} disabled={!rows?.length}>Export CSV</button>
        <Link className="btn p" to="/quotes/new">+ New quote</Link>
      </div>
      <div className="grid3" style={{ alignItems: "end" }}>
        <label className="f" style={{ gridColumn: "span 2" }}>
          <span>Search</span>
          <input autoFocus placeholder="Number, customer, enquiry ref or item description" value={q} onChange={(e) => set("q", e.target.value)} />
        </label>
        <label className="f">
          <span>Salesman</span>
          <select value={salesman} onChange={(e) => set("salesman_id", e.target.value)}>
            <option value="">All</option>
            {salesmen.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="f">
          <span>Status</span>
          <select value={status} onChange={(e) => set("status", e.target.value)}>
            <option value="">All</option>
            {["draft", "printed", "emailed", "cancelled"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </label>
        <label className="f"><span>From</span><input type="date" value={from} onChange={(e) => set("from", e.target.value)} /></label>
        <label className="f"><span>To</span><input type="date" value={to} onChange={(e) => set("to", e.target.value)} /></label>
      </div>
      <div className="btn-row">
        <label className="check"><input type="checkbox" checked={allRevs} onChange={(e) => set("all_revisions", e.target.checked ? "1" : "")} /> Show replaced revisions</label>
        {customer && <button className="btn sm" onClick={() => set("customer_id", "")}>Customer filter ✕</button>}
        <span className="muted" style={{ marginLeft: "auto" }}>
          {rows ? `${rows.length} quote${rows.length === 1 ? "" : "s"} · AED ${money(total)} before VAT` : ""}
        </span>
      </div>
      <div className="card flush">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>No.</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Enquiry ref</th>
                <th>Salesman</th>
                <th className="r">Lines</th>
                <th className="r">Amount (excl. VAT)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.id} className="click" onClick={() => nav(`/quotes/${r.id}`)} style={r.superseded_by ? { opacity: 0.55 } : undefined}>
                  <td className="nowrap"><b className="mono">{r.base_number}</b>{r.rev > 0 && <span className="rev">REV {String(r.rev).padStart(2, "0")}</span>}</td>
                  <td className="nowrap">{dateFmt(r.quote_date)}</td>
                  <td>{r.customer_name}</td>
                  <td>{r.enquiry_ref}</td>
                  <td>{r.salesman_name}</td>
                  <td className="r num">{r.line_count}</td>
                  <td className="r num">{money(r.subtotal)}</td>
                  <td><StatusPill s={r.status} />{r.superseded_by ? <span className="muted" style={{ fontSize: 12 }}> replaced</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows && !rows.length && <div className="empty">No quotations match. <Link to="/quotes/new">Create one</Link>.</div>}
          {!rows && <div className="empty">Loading…</div>}
        </div>
      </div>
    </div>
  );
}
