import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Alert, Box, Button, Center, Loader } from "@mantine/core";
import { IconAlertTriangle, IconMail, IconPrinter } from "@tabler/icons-react";
import { api } from "../../lib/api";
import type { Quote } from "../../lib/types";
import { useApp } from "../../core/app-context";
import { quoteNo } from "../../lib/format";
import { Page } from "../../core/Page";
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

  if (!q || !settings) return <Center py={80}><Loader /></Center>;
  const missing = q.lines.filter((l) => l.kind === "item" && l.rate == null).length;

  return (
    <Page
      crumbs={[{ label: "Quotations", to: "/quotes" }, { label: quoteNo(q.base_number, q.rev), to: `/quotes/${q.id}` }]}
      title="Print Preview"
      actions={
        <>
          <Button variant="default" leftSection={<IconMail size={16} />} onClick={() => setEmailOpen(true)}>Email</Button>
          <Button leftSection={<IconPrinter size={16} />} onClick={doPrint} autoFocus>Print / Save as PDF</Button>
        </>
      }
    >
      {missing > 0 && (
        <Alert className="no-print" color="orange" variant="light" icon={<IconAlertTriangle size={18} />}>
          {missing} line{missing === 1 ? "" : "s"} without rate.
        </Alert>
      )}
      {/* every printed page: quote number bottom-left, page x of y bottom-right */}
      <style>{`@media print { @page { @bottom-left { content: ${JSON.stringify(`${quoteNo(q.base_number, q.rev)} · ${q.customer_name}`)}; } } }`}</style>
      <Box className="paper-wrap">
        <QuoteDocument q={q} company={settings.company} cfg={settings.quotes} />
      </Box>
      {emailOpen && <EmailDialog quote={q} onClose={() => setEmailOpen(false)} onLogged={(u) => { setQ(u); setEmailOpen(false); }} onPrint={() => { setEmailOpen(false); doPrint(); }} />}
    </Page>
  );
}
