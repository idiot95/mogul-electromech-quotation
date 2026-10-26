import { useEffect, useState } from "react";
import { Alert, Badge, Button, Checkbox, Code, Divider, Group, Image, Modal, NumberInput, Paper, SimpleGrid, Stack, Switch, Table, Text, TextInput, Textarea, Title } from "@mantine/core";
import { IconDeviceFloppy, IconInfoCircle, IconPlus } from "@tabler/icons-react";
import { api } from "../lib/api";
import type { CompanySettings, QuoteSettings, Salesman } from "../lib/types";
import { useApp } from "../core/app-context";
import { Page } from "../core/Page";

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setCompany(settings.company);
      setQuotes(settings.quotes);
    }
  }, [settings]);

  if (!company || !quotes) return null;

  async function save() {
    setSaving(true);
    try {
      await api.put("/settings/company", company);
      await api.put("/settings/quotes", { ...quotes, vatRate: Number(quotes!.vatRate) || 0 });
      await reload();
      toast("Settings saved");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }

  const c = (k: keyof CompanySettings) => ({ value: company[k], onChange: (e: { currentTarget: { value: string } }) => setCompany({ ...company, [k]: e.currentTarget.value }) });
  const q = (k: keyof QuoteSettings) => ({ value: String(quotes[k] ?? ""), onChange: (e: { currentTarget: { value: string } }) => setQuotes({ ...quotes, [k]: e.currentTarget.value }) });

  return (
    <Page title="Settings" actions={<Button leftSection={<IconDeviceFloppy size={16} />} loading={saving} onClick={save}>Save settings</Button>}>
      <Paper p="lg">
        <Stack gap="sm">
          <Title order={4}>Company · letterhead</Title>
          <Text c="dimmed" fz="sm">Printed on every document.</Text>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
            <TextInput label="Company name" {...c("name")} />
            <TextInput label="TRN" {...c("trn")} />
            <TextInput label="Email" {...c("email")} />
            <TextInput label="Telephone" {...c("phone")} />
            <TextInput label="Fax" {...c("fax")} />
          </SimpleGrid>
          <Textarea label="Address" autosize minRows={2} {...c("address")} />
          <Group gap="lg" mt="xs">
            <Paper p={6} withBorder><Image src="/logo.jpg" alt="Logo" h={48} w="auto" /></Paper>
            <Image src="/stamp.jpg" alt="Stamp" h={64} w="auto" />
          </Group>
        </Stack>
      </Paper>

      <Paper p="lg">
        <Stack gap="sm">
          <Title order={4}>Quotations</Title>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            <TextInput label="Number prefix" {...q("series")} />
            <NumberInput label="VAT %" value={quotes.vatRate} min={0} max={100} decimalScale={2} onChange={(v) => setQuotes({ ...quotes, vatRate: Number(v) || 0 })} />
            <TextInput label="Currency" {...q("currency")} />
            <TextInput label="Default unit" {...q("defaultUnit")} />
          </SimpleGrid>
          <Text c="dimmed" fz="sm">
            Numbers run <Code>{quotes.series}-YY-001</Code>, <Code>{quotes.series}-YY-002</Code> … and restart each year. Revisions keep the number and add REV 01, REV 02.
          </Text>
          <Divider label="Default terms for new customers" labelPosition="left" />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput label="Payment terms" {...q("paymentTerms")} />
            <TextInput label="Quote validity" {...q("validity")} />
            <TextInput label="Delivery terms" {...q("deliveryTerms")} />
            <TextInput label="VAT terms" {...q("vatTerms")} />
          </SimpleGrid>
          <TextInput label="Footer note on the document" {...q("footerNote")} />
          <Switch
            mt="xs"
            label="Show VAT amount and grand total on the document"
            description='Off: subtotal and the "VAT 5% extra" line only'
            checked={quotes.showVatAmount}
            onChange={(e) => setQuotes({ ...quotes, showVatAmount: e.currentTarget.checked })}
          />
        </Stack>
      </Paper>

      <Paper p="lg">
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={4}>Salesmen</Title>
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setEditSm("new")}>Add salesman</Button>
          </Group>
          <Table highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Email</Table.Th><Table.Th>Phone</Table.Th><Table.Th>Status</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {salesmen.map((s) => (
                <Table.Tr key={s.id} onClick={() => setEditSm(s)} style={{ cursor: "pointer" }}>
                  <Table.Td fw={600}>{s.name}</Table.Td>
                  <Table.Td>{s.email}</Table.Td>
                  <Table.Td>{s.phone}</Table.Td>
                  <Table.Td><Badge variant="light" color={s.active ? "teal" : "gray"}>{s.active ? "Active" : "Inactive"}</Badge></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      </Paper>

      <Alert icon={<IconInfoCircle />} title="Sign-in" color="stamp" variant="light">
        Sign-in is switched off for now — anyone with the link can use this workspace. Microsoft sign-in (company accounts only) and sending through Outlook come next.
      </Alert>

      {editSm && <SalesmanForm s={editSm === "new" ? null : editSm} onClose={() => setEditSm(null)} onSaved={async () => { setEditSm(null); await reload(); }} />}
    </Page>
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
  const f = (k: keyof Salesman) => ({ value: String(d[k] ?? ""), onChange: (e: { currentTarget: { value: string } }) => setD({ ...d, [k]: e.currentTarget.value }) });
  return (
    <Modal opened onClose={props.onClose} size="lg" title={<Text fw={700} ff="heading" fz="lg">{props.s ? "Edit salesman" : "New salesman"}</Text>}>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput label="Name" required data-autofocus {...f("name")} />
          <TextInput label="Email" {...f("email")} />
          <TextInput label="Phone" {...f("phone")} />
        </SimpleGrid>
        <Textarea label="Email template" autosize minRows={8} value={d.email_template ?? DEFAULT_EMAIL_TEMPLATE} onChange={(e) => setD({ ...d, email_template: e.currentTarget.value })} />
        <Text fz="xs" c="dimmed">
          Placeholders: <Code>{"{quote_no} {enquiry_ref} {customer} {salesman} {company} {company_phone} {total}"}</Code>
        </Text>
        <Group justify="space-between" mt="sm">
          {props.s ? <Checkbox label="Active" checked={d.active !== 0} onChange={(e) => setD({ ...d, active: e.currentTarget.checked ? 1 : 0 })} /> : <span />}
          <Group gap="sm">
            <Button variant="default" onClick={props.onClose}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
