import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Anchor, Group, Paper, Progress, ScrollArea, SegmentedControl, SimpleGrid, Stack, Table, Text, ThemeIcon, Title } from "@mantine/core";
import { IconCash, IconFileText, IconUsers } from "@tabler/icons-react";
import { api } from "../../lib/api";
import { money0, quoteNo } from "../../lib/format";
import type { QuoteStatus } from "../../lib/types";
import { StatusBadge } from "./status";

interface Summary {
  since: string;
  days: number;
  kpi: { quotes: number; amount: number; customers: number };
  byCustomer: { name: string; amount: number; quotes: number }[];
  largest: { id: number; base_number: string; rev: number; customer_name: string; subtotal: number; status: QuoteStatus; salesman_name: string | null }[];
  bySalesman: { name: string; amount: number; quotes: number }[];
}

function Bars({ rows }: { rows: { name: string; amount: number; quotes: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  if (!rows.length) return <Text c="dimmed" fz="sm">No quotes in this period yet.</Text>;
  return (
    <Stack gap={10}>
      {rows.map((r) => (
        <div key={r.name} title={`${r.quotes} quote(s)`}>
          <Group justify="space-between" gap="xs" wrap="nowrap" mb={3}>
            <Text fz="sm" truncate>{r.name}</Text>
            <Text fz="sm" ff="monospace" c="dimmed">{money0(r.amount)}</Text>
          </Group>
          <Progress value={(r.amount / max) * 100} size="md" radius="xl" />
        </div>
      ))}
    </Stack>
  );
}

function Kpi(props: { label: string; value: string; icon: typeof IconCash }) {
  return (
    <Paper p="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fz="xs" tt="uppercase" fw={600} c="dimmed" ff="monospace">{props.label}</Text>
          <Text fz={28} fw={800} ff="heading" mt={4}>{props.value}</Text>
        </div>
        <ThemeIcon variant="light" size="lg" radius="md"><props.icon size={20} /></ThemeIcon>
      </Group>
    </Paper>
  );
}

export function QuotesHomeWidget() {
  const [days, setDays] = useState("28");
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    api.get<Summary>(`/quotes/summary?days=${days}`).then(setS);
  }, [days]);

  return (
    <>
      <Group justify="space-between">
        <Title order={2}>Home</Title>
        <SegmentedControl value={days} onChange={setDays} data={[{ value: "7", label: "1 week" }, { value: "28", label: "4 weeks" }, { value: "91", label: "3 months" }, { value: "365", label: "12 months" }]} />
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Kpi label="Quoted · excl. VAT" value={`AED ${money0(s?.kpi.amount ?? 0)}`} icon={IconCash} />
        <Kpi label="Quotes issued" value={String(s?.kpi.quotes ?? "–")} icon={IconFileText} />
        <Kpi label="Customers quoted" value={String(s?.kpi.customers ?? "–")} icon={IconUsers} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper p="lg"><Title order={4} mb="md">By customer (AED)</Title>{s && <Bars rows={s.byCustomer} />}</Paper>
        <Paper p="lg"><Title order={4} mb="md">By salesman (AED)</Title>{s && <Bars rows={s.bySalesman} />}</Paper>
      </SimpleGrid>
      <Paper p="lg">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Largest quotes</Title>
          <Anchor component={Link} to="/quotes" fz="sm">All quotes →</Anchor>
        </Group>
        <ScrollArea>
          <Table highlightOnHover miw={600}>
            <Table.Thead><Table.Tr><Table.Th>No.</Table.Th><Table.Th>Customer</Table.Th><Table.Th>Salesman</Table.Th><Table.Th>Status</Table.Th><Table.Th ta="right">AED (excl. VAT)</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {s?.largest.map((q) => (
                <Table.Tr key={q.id}>
                  <Table.Td style={{ whiteSpace: "nowrap" }}><Anchor component={Link} to={`/quotes/${q.id}`} ff="monospace" fz="sm">{quoteNo(q.base_number, q.rev)}</Anchor></Table.Td>
                  <Table.Td>{q.customer_name}</Table.Td>
                  <Table.Td>{q.salesman_name}</Table.Td>
                  <Table.Td><StatusBadge s={q.status} /></Table.Td>
                  <Table.Td ta="right" ff="monospace" fz="sm">{money0(q.subtotal)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        {s && !s.largest.length && <Text c="dimmed" fz="sm">Nothing yet. <Anchor component={Link} to="/quotes/new">Create the first quote</Anchor>.</Text>}
      </Paper>
    </>
  );
}
