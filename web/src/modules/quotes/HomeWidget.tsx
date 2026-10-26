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

function Kpi(props: { label: string; value: string; sub?: string; icon: typeof IconCash; color?: string }) {
  return (
    <Paper p="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text fz="xs" tt="uppercase" fw={600} c="dimmed" ff="monospace">{props.label}</Text>
          <Text fz={28} fw={800} ff="heading" mt={4} c={props.color}>{props.value}</Text>
          {props.sub && <Text fz="xs" c="dimmed">{props.sub}</Text>}
        </div>
        <ThemeIcon variant="light" size="lg" radius="md"><props.icon size={20} /></ThemeIcon>
      </Group>
    </Paper>
  );
}

const ago = (iso: string) => {
  const d = Math.round((Date.parse(todayUAE()) - Date.parse(iso)) / 86400_000);
  return d >= 14 ? `${Math.floor(d / 7)} weeks ago` : `${d} days ago`;
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
        <Title order={2}>Home</Title>
        <SegmentedControl value={days} onChange={setDays} data={[{ value: "7", label: "1 week" }, { value: "28", label: "4 weeks" }, { value: "91", label: "3 months" }, { value: "365", label: "12 months" }]} />
      </Group>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
        <Kpi label="Quoted · excl. VAT" value={`AED ${money0(s?.kpi.amount ?? 0)}`} sub={s ? `${s.kpi.quotes} quote${s.kpi.quotes === 1 ? "" : "s"} · ${s.kpi.customers} customer${s.kpi.customers === 1 ? "" : "s"}` : undefined} icon={IconCash} />
        <Kpi label="Orders received" value={`AED ${money0(s?.received.amount ?? 0)}`} sub={s ? `${s.received.orders} PO${s.received.orders === 1 ? "" : "s"} in this period` : undefined} icon={IconTrophy} color="green.8" />
        <Kpi label="Win rate" value={winRate == null ? "–" : `${winRate}%`} sub={s ? `${won} won · ${lost} lost · of quotes decided` : undefined} icon={IconTarget} />
        <Kpi label="Awaiting reply" value={String(waiting)} sub="sent or printed, no answer yet" icon={IconHourglass} />
      </SimpleGrid>
      {s && s.followUp.length > 0 && (
        <Paper p="lg">
          <Group justify="space-between" mb="sm">
            <div>
              <Title order={4}>Follow up</Title>
              <Text fz="sm" c="dimmed">Sent more than a week ago and no answer yet: largest first</Text>
            </div>
            <Anchor component={Link} to="/quotes?status=open" fz="sm">All awaiting reply →</Anchor>
          </Group>
          <ScrollArea>
            <Table highlightOnHover miw={600}>
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
        <Paper p="lg"><Title order={4} mb="md">By customer (AED)</Title>{s && <Bars rows={s.byCustomer} />}</Paper>
        <Paper p="lg"><Title order={4} mb="md">By salesman (AED)</Title>{s && <Bars rows={s.bySalesman} />}</Paper>
        {s && s.lostWhy.length > 0 && <Paper p="lg"><Title order={4} mb="md">Why quotes were lost (AED)</Title><Bars rows={s.lostWhy} /></Paper>}
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
