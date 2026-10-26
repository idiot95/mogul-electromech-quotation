import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../../lib/api";
import type { Quote } from "../../lib/types";
import { useApp } from "../../core/app-context";
import { QuoteDocument, pdfFileName } from "./QuoteDocument";
import { EmailDialog } from "./EmailDialog";

export function PrintPage() {
  const { id } = useParams();
  const { settings, toast } = useApp();
  const [q, setQ] = useState<Quote | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => {
    api.get<Quote>(`/quotes/${id}`).then(setQ, (e) => toast(e.message, true));
  }, [id]);

  // The browser uses the page title as the default PDF file name: "ME-26-089 STAR SUPER CEMENT.pdf"
  useEffect(() => {
    if (!q) return;
    const prev = document.title;
    document.title = pdfFileName(q);
    return () => {
      document.title = prev;
    };
  }, [q]);

  async function doPrint() {
    if (!q) return;
    window.print();
    if (q.status === "draft" && !q.superseded_by) {
      try {
        setQ(await api.post<Quote>(`/quotes/${q.id}/status`, { status: "printed" }));
      } catch {
        /* not critical */
      }
    }
  }

  if (!q || !settings) return <div className="page"><div className="empty">Loading…</div></div>;
  const missing = q.lines.filter((l) => l.kind === "item" && l.rate == null).length;

  return (
    <div className="page">
      <div className="page-head no-print">
        <Link to={`/quotes/${q.id}`} className="btn ghost">← Back to editor</Link>
        <span className="sp" />
        <button className="btn ink" onClick={() => setEmailOpen(true)}>Email via Outlook</button>
        <button className="btn p" onClick={doPrint} autoFocus>Print / Save as PDF</button>
      </div>
      {missing > 0 && <div className="banner warn no-print">{missing} line{missing === 1 ? " has" : "s have"} no rate — they will print with a blank rate.</div>}
      <div className="banner info no-print">
        In the print window choose <b>Save as PDF</b> to keep a file (named <span className="mono">{pdfFileName(q)}.pdf</span>), or pick a printer. Set margins to <b>None</b> if your browser asks.
      </div>
      <div className="paper-wrap">
        <QuoteDocument q={q} company={settings.company} cfg={settings.quotes} />
      </div>
      {emailOpen && <EmailDialog quote={q} onClose={() => setEmailOpen(false)} onLogged={(u) => { setQ(u); setEmailOpen(false); }} onPrint={() => { setEmailOpen(false); doPrint(); }} />}
    </div>
  );
}
