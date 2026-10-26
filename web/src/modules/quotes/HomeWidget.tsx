import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../../lib/api";
import { money0, quoteNo } from "../../lib/format";
import { StatusPill } from "./QuoteList";
import type { QuoteStatus } from "../../lib/types";

interface Summary {
  since: string;
  days: number;
  kpi: { quotes: number; amount: number; customers: number };
  byCustomer: { name: string; amount: number; quotes: number }[];
  largest: { id: number; base_number: string; rev: number; customer_name: string; subtotal: number; status: QuoteStatus; salesman_name: string | null }[];
  bySalesman: { name: string; amount: number; quotes: number }[];
}

const PERIODS: [number, string][] = [[7, "1 week"], [28, "4 weeks"], [91, "3 months"], [365, "12 months"]];

export function QuotesHomeWidget() {
  const [days, setDays] = useState(28);
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    api.get<Summary>(`/quotes/summary?days=${days}`).then(setS);
  }, [days]);

  const bars = (rows: { name: string; amount: number; quotes: number }[]) => {
    const max = Math.max(1, ...rows.map((r) => r.amount));
    return (
      <div className="bars">
        {rows.map((r) => (
          <div className="bar" key={r.name} title={`${r.name}: AED ${money0(r.amount)} · ${r.quotes} quote(s)`}>
            <span className="bl">{r.name}</span>
            <span className="bt"><i style={{ width: `${((r.amount / max) * 100).toFixed(1)}%` }} /></span>
            <span className="bv num">{money0(r.amount)}</span>
          </div>
        ))}
        {!rows.length && <div className="muted">No quotes in this period yet.</div>}
      </div>
    );
  };

  return (
    <>
      <div className="page-head">
        <h1>Home</h1>
        <span className="sp" />
        <div className="seg">
          {PERIODS.map(([d, l]) => <button key={d} className={d === days ? "on" : ""} onClick={() => setDays(d)}>{l}</button>)}
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><span className="cap">Quoted · excl. VAT</span><b className="num">AED {money0(s?.kpi.amount ?? 0)}</b></div>
        <div className="kpi"><span className="cap">Quotes issued</span><b className="num">{s?.kpi.quotes ?? "–"}</b></div>
        <div className="kpi"><span className="cap">Customers quoted</span><b className="num">{s?.kpi.customers ?? "–"}</b></div>
      </div>
      <div className="dash">
        <div className="card">
          <h2>By customer (AED)</h2>
          {s && bars(s.byCustomer)}
        </div>
        <div className="card">
          <h2>By salesman (AED)</h2>
          {s && bars(s.bySalesman)}
        </div>
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-head"><h2>Largest quotes</h2><span className="sp" /><Link to="/quotes">All quotes →</Link></div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>No.</th><th>Customer</th><th>Salesman</th><th>Status</th><th className="r">AED (excl. VAT)</th></tr></thead>
            <tbody>
              {s?.largest.map((q) => (
                <tr key={q.id}>
                  <td className="nowrap"><Link to={`/quotes/${q.id}`} className="mono">{quoteNo(q.base_number, q.rev)}</Link></td>
                  <td>{q.customer_name}</td>
                  <td>{q.salesman_name}</td>
                  <td><StatusPill s={q.status} /></td>
                  <td className="r num">{money0(q.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {s && !s.largest.length && <div className="muted">Nothing yet. <Link to="/quotes/new">Create the first quote</Link>.</div>}
        </div>
      </div>
    </>
  );
}
