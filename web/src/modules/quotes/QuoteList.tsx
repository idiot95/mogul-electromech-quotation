import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Button, Checkbox, Group, Paper, ScrollArea, Select, SimpleGrid, Table, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconFileSpreadsheet, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import { api, qs } from "../../lib/api";
import type { QuoteListRow } from "../../lib/types";
import { dateFmt, money, quoteNo, todayUAE } from "../../lib/format";
import { downloadSheet } from "../../lib/sheets";
import { useApp } from "../../core/app-context";
import { Page } from "../../core/Page";
import { RevBadge, STATUS_LABEL, StatusBadge } from "./status";

export function QuoteList() {
  const { salesmen, toast } = useApp();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [rows, setRows] = useState<QuoteListRow[] | null>(null);
  const q = sp.get("q") || "";
  const status = sp.get("status") || "";
  const salesman = sp.get("salesman_id") || "";
  const customer = sp.get("customer_id") || "";
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  const allRevs = sp.get("all_revisions") === "1";

  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    setSp(n, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .get<QuoteListRow[]>("/quotes" + qs({ q, status, salesman_id: salesman, customer_id: customer, from, to, all_revisions: allRevs ? 1 : 0 }))
        .then(setRows, (e) => toast(e.message, true));
    }, 200);
    return () => clearTimeout(t);
  }, [q, status, salesman, customer, from, to, allRevs]);

  const total = rows?.filter((r) => r.status !== "cancelled").reduce((s, r) => s + r.subtotal, 0) ?? 0;

  function exportExcel() {
    if (!rows) return;
    const head = ["Quotation No.", "Date", "Customer", "Enquiry Reference", "Salesperson", "Status", "Lines", "Value excl. VAT", "Value incl. VAT", "Ordered Value excl. VAT", "Lost Reason"];
    const body = rows.map((r) => [quoteNo(r.base_number, r.rev), dateFmt(r.quote_date), r.customer_name, r.enquiry_ref, r.salesman_name, STATUS_LABEL[r.status], r.line_count, r.subtotal, r.total, r.ordered_value || null, r.lost_reason]);
    downloadSheet(`Quotations ${todayUAE()}`, "Quotations", [head, ...body], [16, 12, 40, 20, 16, 12, 8, 16, 16, 18, 18]);
  }

  return (
    <Page
      crumbs={[{ label: "Dashboard", to: "/" }]}
      title="Quotations"
      actions={
        <>
          <Button variant="default" leftSection={<IconFileSpreadsheet size={16} />} onClick={exportExcel} disabled={!rows?.length}>Export to Excel</Button>
          <Button component={Link} to="/quotes/new" leftSection={<IconPlus size={16} />}>New Quotation</Button>
        </>
      }
    >
      <Paper p="lg">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="md">
          <TextInput
            label="Search"
            data-autofocus
            leftSection={<IconSearch size={16} />}

            value={q}
            onChange={(e) => set("q", e.currentTarget.value)}
            style={{ gridColumn: "span 2" }}
          />
          <Select label="Salesperson" placeholder="All" clearable value={salesman || null} onChange={(v) => set("salesman_id", v)} data={salesmen.map((s) => ({ value: String(s.id), label: s.name }))} />
          <Select label="Status" placeholder="All" clearable value={status || null} onChange={(v) => set("status", v)}
            data={[
              { group: "Outcome", items: [{ value: "open", label: "Awaiting Response" }, { value: "ordered", label: "Won or Partly Won" }, { value: "won", label: "Won" }, { value: "partly_won", label: "Partly Won" }, { value: "lost", label: "Lost" }] },
              { group: "Stage", items: [{ value: "draft", label: "Draft" }, { value: "printed", label: "Printed" }, { value: "emailed", label: "Sent" }, { value: "cancelled", label: "Cancelled" }] },
            ]} />
          <DatePickerInput
            type="range"
            label="Date"
            placeholder="All"
            clearable
            valueFormat="DD MMM YYYY"
            value={[from || null, to || null]}
            onChange={([a, b]) => {
              const n = new URLSearchParams(sp);
              a ? n.set("from", String(a).slice(0, 10)) : n.delete("from");
              b ? n.set("to", String(b).slice(0, 10)) : n.delete("to");
              setSp(n, { replace: true });
            }}
          />
        </SimpleGrid>
        <Group mt="md" justify="space-between">
          <Group>
            <Checkbox label="Include Superseded Revisions" checked={allRevs} onChange={(e) => set("all_revisions", e.currentTarget.checked ? "1" : null)} />
            {customer && <Button size="xs" variant="light" rightSection={<IconX size={12} />} onClick={() => set("customer_id", null)}>Customer Filter</Button>}
          </Group>
          <Text c="dimmed" fz="sm">{rows ? `${rows.length} quotation${rows.length === 1 ? "" : "s"} · AED ${money(total)} excl. VAT` : ""}</Text>
        </Group>
      </Paper>

      <Paper p={0}>
        <ScrollArea>
          <Table highlightOnHover miw={900} verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Quotation No.</Table.Th>
                <Table.Th>Date</Table.Th>
                <Table.Th>Customer</Table.Th>
                <Table.Th>Enquiry Reference</Table.Th>
                <Table.Th>Salesperson</Table.Th>
                <Table.Th ta="right">Lines</Table.Th>
                <Table.Th ta="right">Value excl. VAT (AED)</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows?.map((r) => (
                <Table.Tr key={r.id} onClick={() => nav(`/quotes/${r.id}`)} style={{ cursor: "pointer", opacity: r.superseded_by ? 0.55 : 1 }}>
                  <Table.Td style={{ whiteSpace: "nowrap" }}>
                    <Text span ff="monospace" fw={600} fz="sm">{r.base_number}</Text>
                    <RevBadge rev={r.rev} />
                  </Table.Td>
                  <Table.Td style={{ whiteSpace: "nowrap" }}>{dateFmt(r.quote_date)}</Table.Td>
                  <Table.Td>{r.customer_name}</Table.Td>
                  <Table.Td>{r.enquiry_ref}</Table.Td>
                  <Table.Td>{r.salesman_name}</Table.Td>
                  <Table.Td ta="right">{r.line_count}</Table.Td>
                  <Table.Td ta="right" ff="monospace" fz="sm">
                    {money(r.subtotal)}
                    {r.ordered_value > 0 && <Text ff="monospace" fz="xs" c="green.8">Ordered {money(r.ordered_value)}</Text>}
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge s={r.status} />
                    {r.status === "lost" && r.lost_reason ? <Text span c="dimmed" fz="xs" ml={6}>{r.lost_reason}</Text> : null}
                    {r.superseded_by ? <Text span c="dimmed" fz="xs" ml={6}>Superseded</Text> : null}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        {rows && !rows.length && (
          <Text c="dimmed" ta="center" py="xl">
            No quotations found.
          </Text>
        )}
      </Paper>
    </Page>
  );
}
