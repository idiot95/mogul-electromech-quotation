import { useEffect, useState } from "react";
import { Badge, Button, Checkbox, Code, Divider, Group, Image, Modal, NumberInput, Paper, SimpleGrid, Stack, Switch, Table, Text, TextInput, Textarea, Title } from "@mantine/core";
import { IconDeviceFloppy, IconPlus } from "@tabler/icons-react";
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
    <Page crumbs={[{ label: "Dashboard", to: "/" }]} title="Settings" actions={<Button leftSection={<IconDeviceFloppy size={16} />} loading={saving} onClick={save}>Save</Button>}>
      <Paper p="lg">
        <Stack gap="md">
          <Title order={4}>Company Details</Title>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            <TextInput label="Company Name" {...c("name")} />
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
        <Stack gap="md">
          <Title order={4}>Quotation Defaults</Title>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
            <TextInput label="Number Prefix" {...q("series")} />
            <NumberInput label="VAT %" value={quotes.vatRate} min={0} max={100} decimalScale={2} onChange={(v) => setQuotes({ ...quotes, vatRate: Number(v) || 0 })} />
            <TextInput label="Currency" {...q("currency")} />
            <TextInput label="Default Unit" {...q("defaultUnit")} />
          </SimpleGrid>
          <Divider label="Default Terms" labelPosition="left" />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput label="Payment Terms" {...q("paymentTerms")} />
            <TextInput label="Validity" {...q("validity")} />
            <TextInput label="Delivery Terms" {...q("deliveryTerms")} />
            <TextInput label="VAT Terms" {...q("vatTerms")} />
          </SimpleGrid>
          <TextInput label="Document Footer" {...q("footerNote")} />
          <Switch
            mt="xs"
            label="Show VAT Amount and Total on Document"
            checked={quotes.showVatAmount}
            onChange={(e) => setQuotes({ ...quotes, showVatAmount: e.currentTarget.checked })}
          />
        </Stack>
      </Paper>

      <Paper p="lg">
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={4}>Sales Team</Title>
            <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={() => setEditSm("new")}>Add Salesperson</Button>
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
      toast("Salesperson saved");
      props.onSaved();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  const f = (k: keyof Salesman) => ({ value: String(d[k] ?? ""), onChange: (e: { currentTarget: { value: string } }) => setD({ ...d, [k]: e.currentTarget.value }) });
  return (
    <Modal opened onClose={props.onClose} size="lg" title={<Text fw={700} ff="heading" fz="lg">{props.s ? "Edit Salesperson" : "New Salesperson"}</Text>}>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput label="Name" required data-autofocus {...f("name")} />
          <TextInput label="Email" {...f("email")} />
          <TextInput label="Phone" {...f("phone")} />
        </SimpleGrid>
        <Textarea label="Email Template" autosize minRows={8} value={d.email_template ?? DEFAULT_EMAIL_TEMPLATE} onChange={(e) => setD({ ...d, email_template: e.currentTarget.value })} />
        <Text fz="xs" c="dimmed">
          Fields: <Code>{"{quote_no} {enquiry_ref} {customer} {salesman} {company} {company_phone} {total}"}</Code>
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
