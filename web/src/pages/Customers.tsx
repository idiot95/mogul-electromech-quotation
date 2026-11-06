import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Anchor, Button, Checkbox, FileButton, Group, Modal, Paper, ScrollArea, Stack, Table, Text, TextInput } from "@mantine/core";
import { IconFileImport, IconPlus, IconSearch } from "@tabler/icons-react";
import { api, qs } from "../lib/api";
import type { Customer } from "../lib/types";
import { dateFmt } from "../lib/format";
import { CustomerForm } from "../core/CustomerForm";
import { useApp } from "../core/app-context";
import { Page } from "../core/Page";
import { readSheetFile } from "../lib/sheets";

export function CustomersPage() {
  const { toast } = useApp();
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [edit, setEdit] = useState<Customer | null | "new">(null);
  const [importRows, setImportRows] = useState<Record<string, string>[] | null>(null);

  const load = () => api.get<Customer[]>("/customers" + qs({ q, all: showAll ? 1 : 0 })).then(setRows, (e) => toast(e.message, true));
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [q, showAll]);

  async function onFile(f: File | null) {
    if (!f) return;
    try {
      setImportRows(mapCustomerRows(await readSheetFile(f)));
    } catch (e) {
      toast("Could not read file: " + (e as Error).message, true);
    }
  }

  return (
    <Page
      crumbs={[{ label: "Dashboard", to: "/" }]}
      title="Customers"
      actions={
        <>
          <FileButton onChange={onFile} accept=".xlsx,.xls,.csv">
            {(p) => <Button {...p} variant="default" leftSection={<IconFileImport size={16} />}>Import from Excel</Button>}
          </FileButton>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEdit("new")}>New Customer</Button>
        </>
      }
    >
      <Group>
        <TextInput leftSection={<IconSearch size={16} />} placeholder="Search" value={q} onChange={(e) => setQ(e.currentTarget.value)} w={360} maw="100%" />
        <Checkbox label="Include Inactive" checked={showAll} onChange={(e) => setShowAll(e.currentTarget.checked)} />
      </Group>
      <Paper p={0}>
        <ScrollArea>
          <Table highlightOnHover miw={900}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Customer</Table.Th>
                <Table.Th>Contact</Table.Th>
                <Table.Th>Payment Terms</Table.Th>
                <Table.Th>Validity</Table.Th>
                <Table.Th>Delivery Terms</Table.Th>
                <Table.Th ta="right">Quotations</Table.Th>
                <Table.Th>Last Quotation</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows?.map((c) => (
                <Table.Tr key={c.id} onClick={() => setEdit(c)} style={{ cursor: "pointer", opacity: c.active ? 1 : 0.5 }}>
                  <Table.Td fw={600}>{c.name}</Table.Td>
                  <Table.Td>{[c.contact_person, c.email, c.phone].filter(Boolean).join(" · ")}</Table.Td>
                  <Table.Td>{c.payment_terms}</Table.Td>
                  <Table.Td>{c.validity}</Table.Td>
                  <Table.Td>{c.delivery_terms}</Table.Td>
                  <Table.Td ta="right">
                    {c.quote_count ? <Anchor component={Link} to={`/quotes?customer_id=${c.id}`} onClick={(e) => e.stopPropagation()}>{c.quote_count}</Anchor> : 0}
                  </Table.Td>
                  <Table.Td style={{ whiteSpace: "nowrap" }}>{dateFmt(c.last_quote_date)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        {rows && !rows.length && <Text c="dimmed" ta="center" py="xl">No customers found.</Text>}
      </Paper>
      {edit && <CustomerForm customer={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {importRows && <ImportDialog rows={importRows} onClose={() => setImportRows(null)} onDone={() => { setImportRows(null); load(); }} />}
    </Page>
  );
}

const HEADER_MAP: [RegExp, string][] = [
  [/^(customer|party|ledger|account)?\s*name$|^customer$|^party$|^ledger$/i, "name"],
  [/address/i, "address"],
  [/contact/i, "contact_person"],
  [/e-?mail/i, "email"],
  [/phone|mobile|tel/i, "phone"],
  [/trn|vat\s*(reg|no)/i, "trn"],
  [/payment/i, "payment_terms"],
  [/validity/i, "validity"],
  [/delivery/i, "delivery_terms"],
  [/vat\s*terms/i, "vat_terms"],
];

function mapCustomerRows(raw: string[][]): Record<string, string>[] {
  const rows = raw.filter((r) => r.some((c) => c.trim()));
  if (!rows.length) return [];
  const hi = rows.slice(0, 8).findIndex((r) => r.some((c) => HEADER_MAP.some(([re, k]) => k === "name" && re.test(c.trim()))));
  const header = hi >= 0 ? rows[hi] : null;
  const keys = header ? header.map((h) => HEADER_MAP.find(([re]) => re.test(h.trim()))?.[1] || "") : rows[0].map((_, i) => (i === 0 ? "name" : ""));
  const out: Record<string, string>[] = [];
  for (const r of rows.slice(hi + 1)) {
    const o: Record<string, string> = {};
    keys.forEach((k, i) => {
      if (k && r[i]) o[k] = o[k] ? o[k] + "\n" + r[i] : r[i];
    });
    if (o.name) out.push(o);
  }
  return out;
}

const COL_LABEL: Record<string, string> = {
  name: "Name", address: "Address", contact_person: "Contact Person", email: "Email", phone: "Phone", trn: "TRN",
  payment_terms: "Payment Terms", validity: "Validity", delivery_terms: "Delivery Terms",
};

function ImportDialog(props: { rows: Record<string, string>[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = await api.post<{ imported: number; skipped: number }>("/customers/import", { rows: props.rows });
      toast(`${r.imported} customers imported${r.skipped ? `, ${r.skipped} skipped (already exist)` : ""}`);
      props.onDone();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const cols = ["name", "address", "contact_person", "email", "phone", "trn", "payment_terms", "validity", "delivery_terms"];
  return (
    <Modal opened onClose={props.onClose} size="90%" title={<Text fw={700} ff="heading" fz="lg">Import Customers ({props.rows.length})</Text>}>
      <Stack>
        <ScrollArea h="55vh">
          <Table striped withTableBorder fz="sm">
            <Table.Thead><Table.Tr>{cols.map((c) => <Table.Th key={c}>{COL_LABEL[c]}</Table.Th>)}</Table.Tr></Table.Thead>
            <Table.Tbody>
              {props.rows.slice(0, 300).map((r, i) => (
                <Table.Tr key={i}>{cols.map((c) => <Table.Td key={c} style={{ whiteSpace: "pre-line" }}>{r[c]}</Table.Td>)}</Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>Cancel</Button>
          <Button loading={busy} disabled={!props.rows.length} onClick={run}>Import</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
