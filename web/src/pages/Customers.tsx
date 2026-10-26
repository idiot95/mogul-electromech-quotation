import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api, qs } from "../lib/api";
import type { Customer } from "../lib/types";
import { dateFmt } from "../lib/format";
import { CustomerForm } from "../core/CustomerForm";
import { useApp } from "../core/app-context";
import { Modal } from "../core/Modal";
import { readSheetFile } from "../lib/sheets";

export function CustomersPage() {
  const { toast } = useApp();
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [edit, setEdit] = useState<Customer | null | "new">(null);
  const [importRows, setImportRows] = useState<Record<string, string>[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => api.get<Customer[]>("/customers" + qs({ q, all: showAll ? 1 : 0 })).then(setRows, (e) => toast(e.message, true));
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [q, showAll]);

  async function onFile(f: File) {
    try {
      const raw = await readSheetFile(f);
      setImportRows(mapCustomerRows(raw));
    } catch (e) {
      toast("Could not read file: " + (e as Error).message, true);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Customers</h1>
        <span className="sp" />
        <button className="btn" onClick={() => fileRef.current?.click()}>Import from Excel / CSV</button>
        <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button className="btn p" onClick={() => setEdit("new")}>+ New customer</button>
      </div>
      <div className="btn-row">
        <input placeholder="Search name, email or contact…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
        <label className="check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show inactive</label>
      </div>
      <div className="card flush">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th>Payment terms</th>
                <th>Validity</th>
                <th>Delivery</th>
                <th className="r">Quotes</th>
                <th>Last quote</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((c) => (
                <tr key={c.id} className="click" onClick={() => setEdit(c)} style={c.active ? undefined : { opacity: 0.5 }}>
                  <td><b>{c.name}</b></td>
                  <td>{[c.contact_person, c.email, c.phone].filter(Boolean).join(" · ")}</td>
                  <td>{c.payment_terms}</td>
                  <td className="nowrap">{c.validity}</td>
                  <td>{c.delivery_terms}</td>
                  <td className="r num">
                    {c.quote_count ? <Link to={`/quotes?customer_id=${c.id}`} onClick={(e) => e.stopPropagation()}>{c.quote_count}</Link> : 0}
                  </td>
                  <td className="nowrap">{dateFmt(c.last_quote_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows && !rows.length && <div className="empty">No customers found.</div>}
        </div>
      </div>
      {edit && (
        <CustomerForm
          customer={edit === "new" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            load();
          }}
        />
      )}
      {importRows && <ImportDialog rows={importRows} onClose={() => setImportRows(null)} onDone={() => { setImportRows(null); load(); }} />}
    </div>
  );
}

const HEADER_MAP: [RegExp, string][] = [
  [/^(customer|party|ledger|account)?\s*name$|^customer$|^party$|^ledger$/i, "name"],
  [/address/i, "address"],
  [/contact/i, "contact_person"],
  [/e-?mail/i, "email"],
  [/phone|mobile|tel/i, "phone"],
  [/trn|vat\s*(reg|no)/i, "trn"],
  [/payment/i, "payment_terms"],
  [/validity/i, "validity"],
  [/delivery/i, "delivery_terms"],
  [/vat\s*terms/i, "vat_terms"],
];

function mapCustomerRows(raw: string[][]): Record<string, string>[] {
  const rows = raw.filter((r) => r.some((c) => c.trim()));
  if (!rows.length) return [];
  const hi = rows.slice(0, 8).findIndex((r) => r.some((c) => HEADER_MAP.some(([re, k]) => k === "name" && re.test(c.trim()))));
  const header = hi >= 0 ? rows[hi] : null;
  const keys = header
    ? header.map((h) => HEADER_MAP.find(([re]) => re.test(h.trim()))?.[1] || "")
    : rows[0].map((_, i) => (i === 0 ? "name" : ""));
  const out: Record<string, string>[] = [];
  for (const r of rows.slice(hi + 1)) {
    const o: Record<string, string> = {};
    keys.forEach((k, i) => {
      if (k && r[i]) o[k] = o[k] ? o[k] + "\n" + r[i] : r[i];
    });
    if (o.name) out.push(o);
  }
  return out;
}

function ImportDialog(props: { rows: Record<string, string>[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = await api.post<{ imported: number; skipped: number }>("/customers/import", { rows: props.rows });
      toast(`${r.imported} customers imported${r.skipped ? `, ${r.skipped} skipped (already exist)` : ""}`);
      props.onDone();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const cols = ["name", "address", "contact_person", "email", "phone", "trn", "payment_terms", "validity", "delivery_terms"];
  return (
    <Modal
      wide
      title={`Import ${props.rows.length} customers`}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>Cancel</button>
          <button className="btn p" disabled={busy || !props.rows.length} onClick={run}>Import</button>
        </>
      }
    >
      <p className="muted">
        Columns are matched by header name (Name / Customer / Ledger, Address, Contact, Email, Phone, TRN, Payment, Validity, Delivery).
        Customers whose name already exists are skipped. Blank terms fall back to the company defaults when quoting.
      </p>
      <div className="pp-table">
        <table className="tbl">
          <thead><tr>{cols.map((c) => <th key={c}>{c.replace("_", " ")}</th>)}</tr></thead>
          <tbody>
            {props.rows.slice(0, 200).map((r, i) => (
              <tr key={i}>{cols.map((c) => <td key={c} style={{ whiteSpace: "pre-line" }}>{r[c]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
