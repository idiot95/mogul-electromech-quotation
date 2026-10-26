import { useState } from "react";
import { Alert, Anchor, Button, Code, Group, Modal, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { IconCopy, IconMail, IconPaperclip } from "@tabler/icons-react";
import { api } from "../../lib/api";
import type { Quote } from "../../lib/types";
import { money, quoteNo } from "../../lib/format";
import { useApp } from "../../core/app-context";
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
    const href =
      `mailto:${to.split(",").map((s) => s.trim()).join(",")}?` +
      new URLSearchParams({ cc, subject, body: bodyText }).toString().replace(/\+/g, "%20");
    window.location.href = href;
    try {
      const updated = await api.post<Quote>(`/quotes/${q.id}/emails`, { to, cc, subject, method: "mailto", sent_by: q.salesman_name });
      props.onLogged(updated);
      toast("Email opened in Outlook and logged on the quote");
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <Modal opened onClose={props.onClose} size="lg" title={<Text fw={700} ff="heading" fz="lg">Email {no}</Text>}>
      <Stack gap="sm">
        <Alert color="stamp" variant="light" icon={<IconPaperclip size={18} />} title="Attach the PDF">
          <Anchor component="button" type="button" onClick={props.onPrint} fz="sm">Print the quote</Anchor> and choose “Save as PDF” — the file is named{" "}
          <Code>{pdfFileName(q)}.pdf</Code>. Attach it to the email that opens. Picking an Outlook thread and attaching automatically arrive with Microsoft sign-in.
        </Alert>
        <TextInput label="To" value={to} onChange={(e) => setTo(e.currentTarget.value)} placeholder="customer@example.com" data-autofocus />
        <TextInput label="Cc" value={cc} onChange={(e) => setCc(e.currentTarget.value)} />
        <TextInput label="Subject" value={subject} onChange={(e) => setSubject(e.currentTarget.value)} />
        <Textarea label="Message" autosize minRows={8} value={bodyText} onChange={(e) => setBody(e.currentTarget.value)} />
        <Group justify="space-between" mt="xs">
          <Button variant="subtle" leftSection={<IconCopy size={16} />} onClick={() => navigator.clipboard.writeText(bodyText).then(() => toast("Message copied"))}>Copy message</Button>
          <Group gap="sm">
            <Button variant="default" onClick={props.onClose}>Cancel</Button>
            <Button color="stamp" leftSection={<IconMail size={16} />} onClick={open} disabled={!to.trim()}>Open in Outlook</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
