import { useState } from "react";
import { api } from "../../lib/api";
import type { Quote } from "../../lib/types";
import { money, quoteNo } from "../../lib/format";
import { useApp } from "../../core/app-context";
import { Modal } from "../../core/Modal";
import { DEFAULT_EMAIL_TEMPLATE } from "../../pages/Settings";
import { pdfFileName } from "./QuoteDocument";

function fill(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export function EmailDialog(props: { quote: Quote; onClose: () => void; onLogged: (q: Quote) => void; onPrint: () => void }) {
  const { settings, toast } = useApp();
  const q = props.quote;
  const no = quoteNo(q.base_number, q.rev);
  const vars = {
    quote_no: no,
    enquiry_ref: q.enquiry_ref || "",
    customer: q.customer_name,
    salesman: q.salesman_name || "",
    company: settings?.company.name || "",
    company_phone: settings?.company.phone || "",
    total: `${q.currency} ${money(q.total)}`,
  };
  const [to, setTo] = useState(q.customer_email || "");
  const [cc, setCc] = useState([q.salesman_email, settings?.company.email].filter(Boolean).join(", "));
  const [subject, setSubject] = useState(`Quotation ${no}${q.enquiry_ref ? ` · Enquiry ${q.enquiry_ref}` : ""} · ${q.customer_name}`);
  const [bodyText, setBody] = useState(() => {
    let b = fill(q.salesman_email_template || DEFAULT_EMAIL_TEMPLATE, vars);
    if (!q.enquiry_ref) b = b.replace(/ against your enquiry \.?/, ".");
    return b;
  });

  async function open() {
    const href = `mailto:${encodeURIComponent(to).replace(/%40/g, "@").replace(/%2C/g, ",")}?` +
      new URLSearchParams({ cc, subject, body: bodyText }).toString().replace(/\+/g, "%20");
    window.location.href = href;
    try {
      const updated = await api.post<Quote>(`/quotes/${q.id}/emails`, { to, cc, subject, method: "mailto", sent_by: q.salesman_name });
      props.onLogged(updated);
      toast("Email opened in your mail app and logged on the quote");
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <Modal
      title={`Email ${no}`}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={() => navigator.clipboard.writeText(bodyText).then(() => toast("Message copied"))}>Copy message</button>
          <button className="btn" onClick={props.onClose}>Cancel</button>
          <button className="btn p" onClick={open} disabled={!to.trim()}>Open in Outlook</button>
        </>
      }
    >
      <div className="banner info">
        <b>Attach the PDF:</b> first <a href="#" onClick={(e) => { e.preventDefault(); props.onPrint(); }}>print the quote</a> and choose
        “Save as PDF” — the file is named <span className="mono">{pdfFileName(q)}.pdf</span>. Then attach it to the email that opens.
        Picking an Outlook thread and attaching automatically arrive with Microsoft sign-in.
      </div>
      <label className="f"><span>To</span><input value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" /></label>
      <label className="f"><span>Cc</span><input value={cc} onChange={(e) => setCc(e.target.value)} /></label>
      <label className="f"><span>Subject</span><input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
      <label className="f"><span>Message</span><textarea rows={10} value={bodyText} onChange={(e) => setBody(e.target.value)} /></label>
    </Modal>
  );
}
