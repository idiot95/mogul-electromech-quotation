import type { CompanySettings, Line, QuoteSettings } from "../../lib/types";
import { amountInWords, dateFmt, money, qtyFmt, quoteNo } from "../../lib/format";

export interface DocQuote {
  base_number: string;
  rev: number;
  quote_date: string;
  customer_name: string;
  customer_address: string | null;
  attention: string | null;
  enquiry_ref: string | null;
  salesman_name: string | null;
  payment_terms: string | null;
  validity: string | null;
  delivery_terms: string | null;
  vat_terms: string | null;
  vat_rate: number;
  currency: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  notes: string | null;
  lines: Line[];
}

/** The printed quotation, in the layout of Mogul's Excel template. Also what "Save as PDF" produces. */
export function QuoteDocument({ q, company, cfg }: { q: DocQuote; company: CompanySettings; cfg: QuoteSettings }) {
  let sr = 0;
  const cur = q.currency || "AED";
  return (
    <div className="paper">
      <div className="top">
        <img src="/logo.jpg" alt={company.name} />
        <div className="addr">
          {company.address}
          {"\n"}Tel {company.phone}
          {company.fax ? ` · Fax ${company.fax}` : ""}
          {"\n"}
          {company.email}
          {"\n"}TRN {company.trn}
        </div>
      </div>
      <h4>QUOTATION</h4>
      <div className="hd">
        <div className="to">
          <span style={{ color: "#666" }}>To,</span>
          {"\n"}
          <b>{q.customer_name}</b>
          {q.customer_address ? "\n" + q.customer_address : ""}
          {q.attention ? `\nKind attn: ${q.attention}` : ""}
        </div>
        <div className="kv">
          <span>No.</span><b>{quoteNo(q.base_number, q.rev)}</b>
          <span>Date</span><span>{dateFmt(q.quote_date)}</span>
          {q.enquiry_ref && <><span>Enquiry ref.</span><span>{q.enquiry_ref}</span></>}
          {q.salesman_name && <><span>Salesman</span><span>{q.salesman_name}</span></>}
          {q.delivery_terms && <><span>Delivery terms</span><span>{q.delivery_terms}</span></>}
          {q.validity && <><span>Quote validity</span><span>{q.validity}</span></>}
          {q.payment_terms && <><span>Terms of payment</span><span>{q.payment_terms}</span></>}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 34 }}>SR</th>
            <th>DESCRIPTION OF GOODS</th>
            <th style={{ width: 60, textAlign: "right" }}>QTY</th>
            <th style={{ width: 50 }}>UNIT</th>
            <th style={{ width: 85, textAlign: "right" }}>RATE ({cur})</th>
            <th style={{ width: 95, textAlign: "right" }}>AMOUNT ({cur})</th>
          </tr>
        </thead>
        <tbody>
          {q.lines.map((l, i) =>
            l.kind === "heading" ? (
              <tr key={i} className="hd"><td /><td colSpan={5}>{l.description}</td></tr>
            ) : (
              <tr key={i}>
                <td style={{ textAlign: "center" }}>{++sr}</td>
                <td className="d">{l.description}</td>
                <td className="num" style={{ textAlign: "right" }}>{qtyFmt(l.qty)}</td>
                <td>{l.unit}</td>
                <td className="num" style={{ textAlign: "right" }}>{l.rate == null ? "" : money(l.rate)}</td>
                <td className="num" style={{ textAlign: "right" }}>{l.qty != null && l.rate != null ? money(l.amount ?? l.qty * l.rate) : ""}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      <div className="sum">
        <span>Subtotal</span><b className="num">{money(q.subtotal)}</b>
        {cfg.showVatAmount ? (
          <>
            <span>{q.vat_terms || `VAT ${q.vat_rate}%`}</span><span className="num">{money(q.vat_amount)}</span>
            <b>Total {cur}</b><b className="num">{money(q.total)}</b>
          </>
        ) : (
          <><span>{q.vat_terms || `VAT ${q.vat_rate}% extra as per UAE law`}</span><span /></>
        )}
      </div>
      <div className="words">{amountInWords(cfg.showVatAmount ? q.total : q.subtotal, cur)}</div>
      {q.notes && <div className="remarks"><b>Remarks:</b> {q.notes}</div>}
      <div className="foot">
        <div>
          <small>Note: {cfg.footerNote}</small>
        </div>
        <div style={{ textAlign: "center" }}>
          <div>For {company.name}</div>
          <img src="/stamp.jpg" alt="" />
          <div>Authorised Signatory</div>
        </div>
      </div>
    </div>
  );
}

export const pdfFileName = (q: { base_number: string; rev: number; customer_name: string }) =>
  `${quoteNo(q.base_number, q.rev)} ${q.customer_name}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
