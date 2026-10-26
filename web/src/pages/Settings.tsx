import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { CompanySettings, QuoteSettings, Salesman } from "../lib/types";
import { useApp } from "../core/app-context";
import { Modal } from "../core/Modal";

export const DEFAULT_EMAIL_TEMPLATE = `Dear Sir,

Please find attached our quotation {quote_no} against your enquiry {enquiry_ref}.

Kindly let us know if you need any clarification.

Best regards,
{salesman}
{company} · {company_phone}`;

export function SettingsPage() {
  const { settings, salesmen, reload, toast } = useApp();
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [quotes, setQuotes] = useState<QuoteSettings | null>(null);
  const [editSm, setEditSm] = useState<Salesman | "new" | null>(null);

  useEffect(() => {
    if (settings) {
      setCompany(settings.company);
      setQuotes(settings.quotes);
    }
  }, [settings]);

  if (!company || !quotes) return <div className="page" />;

  async function save() {
    try {
      await api.put("/settings/company", company);
      await api.put("/settings/quotes", { ...quotes, vatRate: Number(quotes!.vatRate) || 0 });
      await reload();
      toast("Settings saved");
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  const c = (k: keyof CompanySettings) => (e: { target: { value: string } }) => setCompany({ ...company, [k]: e.target.value });
  const q = (k: keyof QuoteSettings) => (e: { target: { value: string } }) => setQuotes({ ...quotes, [k]: e.target.value });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Settings</h1>
        <span className="sp" />
        <button className="btn p" onClick={save}>Save settings</button>
      </div>

      <div className="card">
        <h2>Company · letterhead</h2>
        <p className="muted">Printed on every document. Logo and stamp are the files in <span className="mono">web/public</span>.</p>
        <div className="grid2">
          <label className="f"><span>Company name</span><input value={company.name} onChange={c("name")} /></label>
          <label className="f"><span>TRN</span><input value={company.trn} onChange={c("trn")} /></label>
          <label className="f"><span>Telephone</span><input value={company.phone} onChange={c("phone")} /></label>
          <label className="f"><span>Fax</span><input value={company.fax} onChange={c("fax")} /></label>
          <label className="f"><span>Email</span><input value={company.email} onChange={c("email")} /></label>
        </div>
        <label className="f"><span>Address</span><textarea rows={2} value={company.address} onChange={c("address")} /></label>
        <div className="btn-row">
          <img src="/logo.jpg" alt="Logo" style={{ height: 48, background: "#fff", padding: 4, border: "1px solid var(--line)" }} />
          <img src="/stamp.jpg" alt="Stamp" style={{ height: 64 }} />
        </div>
      </div>

      <div className="card">
        <h2>Quotations</h2>
        <div className="grid3">
          <label className="f"><span>Number prefix</span><input value={quotes.series} onChange={q("series")} /></label>
          <label className="f"><span>VAT %</span><input inputMode="decimal" value={String(quotes.vatRate)} onChange={q("vatRate")} /></label>
          <label className="f"><span>Currency</span><input value={quotes.currency} onChange={q("currency")} /></label>
          <label className="f"><span>Default unit</span><input value={quotes.defaultUnit} onChange={q("defaultUnit")} /></label>
        </div>
        <p className="muted">Numbers run {quotes.series}-YY-001, {quotes.series}-YY-002 … and restart each year. Revisions keep the number and add REV 01, REV 02.</p>
        <div className="cap">Default terms for new customers</div>
        <div className="grid2">
          <label className="f"><span>Payment terms</span><input value={quotes.paymentTerms} onChange={q("paymentTerms")} /></label>
          <label className="f"><span>Quote validity</span><input value={quotes.validity} onChange={q("validity")} /></label>
          <label className="f"><span>Delivery terms</span><input value={quotes.deliveryTerms} onChange={q("deliveryTerms")} /></label>
          <label className="f"><span>VAT terms</span><input value={quotes.vatTerms} onChange={q("vatTerms")} /></label>
        </div>
        <label className="f"><span>Footer note on the document</span><input value={quotes.footerNote} onChange={q("footerNote")} /></label>
        <label className="check">
          <input type="checkbox" checked={quotes.showVatAmount} onChange={(e) => setQuotes({ ...quotes, showVatAmount: e.target.checked })} />
          Show VAT amount and grand total on the document (unticked: subtotal + "VAT 5% extra" line only)
        </label>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Salesmen</h2>
          <span className="sp" />
          <button className="btn sm" onClick={() => setEditSm("new")}>+ Add salesman</button>
        </div>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead>
          <tbody>
            {salesmen.map((s) => (
              <tr key={s.id} className="click" onClick={() => setEditSm(s)} style={s.active ? undefined : { opacity: 0.5 }}>
                <td><b>{s.name}</b></td>
                <td>{s.email}</td>
                <td>{s.phone}</td>
                <td>{s.active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Sign-in</h2>
        <p className="muted">Sign-in is switched off for now. Anyone with the link can use this workspace. Microsoft sign-in (company accounts only) and sending through Outlook will be added in the next step.</p>
      </div>

      {editSm && <SalesmanForm s={editSm === "new" ? null : editSm} onClose={() => setEditSm(null)} onSaved={async () => { setEditSm(null); await reload(); }} />}
    </div>
  );
}

function SalesmanForm(props: { s: Salesman | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [d, setD] = useState<Partial<Salesman>>(props.s ?? { name: "", active: 1, email_template: DEFAULT_EMAIL_TEMPLATE });
  async function save() {
    try {
      if (props.s) await api.put(`/salesmen/${props.s.id}`, d);
      else await api.post("/salesmen", d);
      toast("Salesman saved");
      props.onSaved();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  const set = (k: keyof Salesman) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  return (
    <Modal
      title={props.s ? "Edit salesman" : "New salesman"}
      onClose={props.onClose}
      footer={
        <>
          {props.s && (
            <label className="check" style={{ marginRight: "auto" }}>
              <input type="checkbox" checked={d.active !== 0} onChange={(e) => setD({ ...d, active: e.target.checked ? 1 : 0 })} /> Active
            </label>
          )}
          <button className="btn" onClick={props.onClose}>Cancel</button>
          <button className="btn p" onClick={save}>Save</button>
        </>
      }
    >
      <div className="grid2">
        <label className="f"><span>Name *</span><input autoFocus value={d.name || ""} onChange={set("name")} /></label>
        <label className="f"><span>Email</span><input value={d.email || ""} onChange={set("email")} /></label>
        <label className="f"><span>Phone</span><input value={d.phone || ""} onChange={set("phone")} /></label>
      </div>
      <label className="f">
        <span>Email template</span>
        <textarea rows={9} value={d.email_template ?? DEFAULT_EMAIL_TEMPLATE} onChange={set("email_template")} />
      </label>
      <p className="muted" style={{ fontSize: 13 }}>
        Placeholders: <span className="mono">{"{quote_no} {enquiry_ref} {customer} {salesman} {company} {company_phone} {total}"}</span>
      </p>
    </Modal>
  );
}
