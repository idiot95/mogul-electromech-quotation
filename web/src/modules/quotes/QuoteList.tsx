import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Anchor, Button, Checkbox, Group, Paper, ScrollArea, Select, SimpleGrid, Table, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconDownload, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import { api, qs } from "../../lib/api";
import type { QuoteListRow } from "../../lib/types";
import { dateFmt, money, quoteNo } from "../../lib/format";
import { useApp } from "../../core/app-context";
import { Page } from "../../core/Page";
import { RevBadge, StatusBadge } from "./status";

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

  function exportCsv() {
    if (!rows) return;
    const head = ["Number", "Date", "Customer", "Enquiry ref", "Salesman", "Status", "Lines", "Subtotal", "Total"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = rows.map((r) => [quoteNo(r.base_number, r.rev), r.quote_date, r.customer_name, r.enquiry_ref, r.salesman_name, r.status, r.line_count, r.subtotal, r.total].map(esc).join(","));
    const blob = new Blob([[head.join(","), ...body].join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quotations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Page
      title="Quotations"
      actions={
        <>
          <Button variant="default" leftSection={<IconDownload size={16} />} onClick={exportCsv} disabled={!rows?.length}>Export CSV</Button>
          <Button component={Link} to="/quotes/new" leftSection={<IconPlus size={16} />}>New quote</Button>
        </>
      }
    >
      <Paper p="md">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="sm">
          <TextInput
            label="Search"
            data-autofocus
            leftSection={<IconSearch size={16} />}
            placeholder="Number, customer, enquiry ref, item…"
            value={q}
            onChange={(e) => set("q", e.currentTarget.value)}
            style={{ gridColumn: "span 2" }}
          />
          <Select label="Salesman" placeholder="All" clearable value={salesman || null} onChange={(v) => set("salesman_id", v)} data={salesmen.map((s) => ({ value: String(s.id), label: s.name }))} />
          <Select label="Status" placeholder="All" clearable value={status || null} onChange={(v) => set("status", v)}
            data={[{ value: "draft", label: "Draft" }, { value: "printed", label: "Printed" }, { value: "emailed", label: "Emailed" }, { value: "cancelled", label: "Cancelled" }]} />
          <DatePickerInput
            type="range"
            label="Date"
            placeholder="Any date"
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
        <Group mt="sm" justify="space-between">
          <Group>
            <Checkbox label="Show replaced revisions" checked={allRevs} onChange={(e) => set("all_revisions", e.currentTarget.checked ? "1" : null)} />
            {customer && <Button size="xs" variant="light" rightSection={<IconX size={12} />} onClick={() => set("customer_id", null)}>Customer filter</Button>}
          </Group>
          <Text c="dimmed" fz="sm">{rows ? `${rows.length} quote${rows.length === 1 ? "" : "s"} · AED ${money(total)} before VAT` : ""}</Text>
        </Group>
      </Paper>

      <Paper p={0}>
        <ScrollArea>
          <Table highlightOnHover miw={900} verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>No.</Table.Th>
                <Table.Th>Date</Table.Th>
                <Table.Th>Customer</Table.Th>
                <Table.Th>Enquiry ref</Table.Th>
                <Table.Th>Salesman</Table.Th>
                <Table.Th ta="right">Lines</Table.Th>
                <Table.Th ta="right">Amount (excl. VAT)</Table.Th>
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
                  <Table.Td ta="right" ff="monospace" fz="sm">{money(r.subtotal)}</Table.Td>
                  <Table.Td>
                    <StatusBadge s={r.status} />
                    {r.superseded_by ? <Text span c="dimmed" fz="xs" ml={6}>replaced</Text> : null}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        {rows && !rows.length && (
          <Text c="dimmed" ta="center" py="xl">
            No quotations match. <Anchor component={Link} to="/quotes/new">Create one</Anchor>.
          </Text>
        )}
      </Paper>
    </Page>
  );
}
