import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Anchor, Group, Paper, Progress, ScrollArea, SegmentedControl, SimpleGrid, Stack, Table, Text, ThemeIcon, Title } from "@mantine/core";
import { IconCash, IconHourglass, IconTarget, IconTrophy } from "@tabler/icons-react";
import { api } from "../../lib/api";
import { money0, quoteNo, todayUAE } from "../../lib/format";
import type { QuoteStatus } from "../../lib/types";
import { StatusBadge } from "./status";

interface Summary {
  since: string;
  days: number;
  kpi: { quotes: number; amount: number; customers: number };
  byCustomer: { name: string; amount: number; quotes: number }[];
  largest: { id: number; base_number: string; rev: number; customer_name: string; subtotal: number; status: QuoteStatus; salesman_name: string | null }[];
  bySalesman: { name: string; amount: number; quotes: number }[];
  byStatus: { status: QuoteStatus; quotes: number; amount: number }[];
  received: { orders: number; amount: number };
  followUp: { id: number; base_number: string; rev: number; quote_date: string; customer_name: string; subtotal: number; status: QuoteStatus; salesman_name: string | null }[];
  lostWhy: { name: string; amount: number; quotes: number }[];
}

function Bars({ rows }: { rows: { name: string; amount: number; quotes: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  if (!rows.length) return <Text c="dimmed" fz="sm">No data for this period.</Text>;
  return (
    <Stack gap={10}>
      {rows.map((r) => (
        <div key={r.name} title={`${r.quotes} quotation(s)`}>
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

function Kpi(props: { label: string; value: string; sub?: string; icon: typeof IconCash; color?: string }) {
  return (
    <Paper p="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text fz="sm" fw={600} c="dimmed">{props.label}</Text>
          <Text fz={26} fw={700} ff="heading" mt={6} c={props.color}>{props.value}</Text>
          {props.sub && <Text fz="xs" c="dimmed" mt={2}>{props.sub}</Text>}
        </div>
        <ThemeIcon variant="light" size="lg" radius="md"><props.icon size={20} /></ThemeIcon>
      </Group>
    </Paper>
  );
}

const ago = (iso: string) => {
  const d = Math.round((Date.parse(todayUAE()) - Date.parse(iso)) / 86400_000);
  return d >= 14 ? `${Math.floor(d / 7)} weeks` : `${d} days`;
};

export function QuotesHomeWidget() {
  const [days, setDays] = useState("28");
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    api.get<Summary>(`/quotes/summary?days=${days}`).then(setS);
  }, [days]);

  const count = (...st: QuoteStatus[]) => s?.byStatus.filter((r) => st.includes(r.status)).reduce((a, r) => a + r.quotes, 0) ?? 0;
  const won = count("won", "partly_won");
  const lost = count("lost");
  const waiting = count("printed", "emailed");
  const winRate = won + lost ? Math.round((won / (won + lost)) * 100) : null;

  return (
    <>
      <Group justify="space-between">
        <Title order={2}>Dashboard</Title>
        <SegmentedControl value={days} onChange={setDays} data={[{ value: "7", label: "7 Days" }, { value: "28", label: "4 Weeks" }, { value: "91", label: "3 Months" }, { value: "365", label: "12 Months" }]} />
      </Group>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
        <Kpi label="Quoted Value excl. VAT" value={`AED ${money0(s?.kpi.amount ?? 0)}`} sub={s ? `${s.kpi.quotes} quotation${s.kpi.quotes === 1 ? "" : "s"} · ${s.kpi.customers} customer${s.kpi.customers === 1 ? "" : "s"}` : undefined} icon={IconCash} />
        <Kpi label="Orders Received excl. VAT" value={`AED ${money0(s?.received.amount ?? 0)}`} sub={s ? `${s.received.orders} purchase order${s.received.orders === 1 ? "" : "s"}` : undefined} icon={IconTrophy} color="green.8" />
        <Kpi label="Win Rate" value={winRate == null ? "–" : `${winRate}%`} sub={s ? `${won} won · ${lost} lost` : undefined} icon={IconTarget} />
        <Kpi label="Awaiting Response" value={String(waiting)} icon={IconHourglass} />
      </SimpleGrid>
      {s && s.followUp.length > 0 && (
        <Paper p="lg">
          <Group justify="space-between" mb="sm">
            <Title order={4}>Follow-Up Required</Title>
            <Anchor component={Link} to="/quotes?status=open" fz="sm">View All</Anchor>
          </Group>
          <ScrollArea>
            <Table highlightOnHover miw={600}>
              <Table.Thead><Table.Tr><Table.Th>Quotation No.</Table.Th><Table.Th>Customer</Table.Th><Table.Th>Salesperson</Table.Th><Table.Th>Age</Table.Th><Table.Th ta="right">Value excl. VAT (AED)</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {s.followUp.map((q) => (
                  <Table.Tr key={q.id}>
                    <Table.Td style={{ whiteSpace: "nowrap" }}><Anchor component={Link} to={`/quotes/${q.id}`} ff="monospace" fz="sm">{quoteNo(q.base_number, q.rev)}</Anchor></Table.Td>
                    <Table.Td>{q.customer_name}</Table.Td>
                    <Table.Td>{q.salesman_name}</Table.Td>
                    <Table.Td c="dimmed" fz="sm" style={{ whiteSpace: "nowrap" }}>{ago(q.quote_date)}</Table.Td>
                    <Table.Td ta="right" ff="monospace" fz="sm">{money0(q.subtotal)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      )}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper p="lg"><Title order={4} mb="lg">Quoted Value by Customer (AED)</Title>{s && <Bars rows={s.byCustomer} />}</Paper>
        <Paper p="lg"><Title order={4} mb="lg">Quoted Value by Salesperson (AED)</Title>{s && <Bars rows={s.bySalesman} />}</Paper>
        {s && s.lostWhy.length > 0 && <Paper p="lg"><Title order={4} mb="lg">Lost Value by Reason (AED)</Title><Bars rows={s.lostWhy} /></Paper>}
      </SimpleGrid>
      <Paper p="lg">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Largest Quotations</Title>
          <Anchor component={Link} to="/quotes" fz="sm">View All</Anchor>
        </Group>
        <ScrollArea>
          <Table highlightOnHover miw={600}>
            <Table.Thead><Table.Tr><Table.Th>Quotation No.</Table.Th><Table.Th>Customer</Table.Th><Table.Th>Salesperson</Table.Th><Table.Th>Status</Table.Th><Table.Th ta="right">Value excl. VAT (AED)</Table.Th></Table.Tr></Table.Thead>
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
        {s && !s.largest.length && <Text c="dimmed" fz="sm">No quotations for this period.</Text>}
      </Paper>
    </>
  );
}
