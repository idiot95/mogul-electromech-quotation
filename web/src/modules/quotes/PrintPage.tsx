import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Alert, Box, Button, Center, Code, Group, Loader } from "@mantine/core";
import { IconAlertTriangle, IconArrowLeft, IconInfoCircle, IconMail, IconPrinter } from "@tabler/icons-react";
import { api } from "../../lib/api";
import type { Quote } from "../../lib/types";
import { useApp } from "../../core/app-context";
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
      title={<Button component={Link} to={`/quotes/${q.id}`} variant="subtle" leftSection={<IconArrowLeft size={16} />}>Back to editor</Button>}
      actions={
        <>
          <Button variant="light" color="stamp" leftSection={<IconMail size={16} />} onClick={() => setEmailOpen(true)}>Email via Outlook</Button>
          <Button leftSection={<IconPrinter size={16} />} onClick={doPrint} autoFocus>Print / Save as PDF</Button>
        </>
      }
    >
      {missing > 0 && (
        <Alert className="no-print" color="orange" variant="light" icon={<IconAlertTriangle size={18} />}>
          {missing} line{missing === 1 ? " has" : "s have"} no rate — they will print with a blank rate.
        </Alert>
      )}
      <Alert className="no-print" color="stamp" variant="light" icon={<IconInfoCircle size={18} />}>
        In the print window choose <b>Save as PDF</b> to keep a file (named <Code>{pdfFileName(q)}.pdf</Code>), or pick a printer. Set margins to <b>None</b> if your browser asks.
      </Alert>
      <Box className="paper-wrap">
        <QuoteDocument q={q} company={settings.company} cfg={settings.quotes} />
      </Box>
      <Group />
      {emailOpen && <EmailDialog quote={q} onClose={() => setEmailOpen(false)} onLogged={(u) => { setQ(u); setEmailOpen(false); }} onPrint={() => { setEmailOpen(false); doPrint(); }} />}
    </Page>
  );
}
