import { useMemo, useState } from "react";
import { Anchor, Button, Checkbox, Group, Modal, Paper, ScrollArea, SimpleGrid, Stack, Table, Text, TextInput, Textarea } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { Dropzone } from "@mantine/dropzone";
import { useMediaQuery } from "@mantine/hooks";
import { IconCheck, IconFileUpload, IconPaperclip, IconX } from "@tabler/icons-react";
import { api } from "../../lib/api";
import { uploadFile } from "../../lib/upload";
import type { Order, Quote } from "../../lib/types";
import { money, qtyFmt, quoteNo, round2, todayUAE } from "../../lib/format";
import { useApp } from "../../core/app-context";

interface Row {
  pos: number;
  description: string;
  unit: string | null;
  quotedQty: number | null;
  quotedRate: number | null;
  before: number; // already ordered on other POs
  on: boolean;
  qty: string;
  rate: string;
}

const n = (s: string) => {
  const v = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
};

/** "We got the order": tick the lines on the PO; qty starts at what is still open, rate at the quoted rate. */
export function OrderDialog(props: { quote: Quote; order?: Order; onClose: () => void; onSaved: (q: Quote) => void }) {
  const { quote, order } = props;
  const { toast } = useApp();
  const small = useMediaQuery("(max-width: 48em)");
  const [poNumber, setPoNumber] = useState(order?.po_number || "");
  const [poDate, setPoDate] = useState<string>(order?.po_date || todayUAE());
  const [note, setNote] = useState(order?.note || "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const cur = quote.currency || "AED";

  const [rows, setRows] = useState<Row[]>(() => {
    // what other POs already took, matched by line position + description
    const before = new Map<string, number>();
    for (const o of quote.orders) {
      if (o.id === order?.id) continue;
      for (const l of o.lines) before.set(`${l.pos}|${l.description}`, (before.get(`${l.pos}|${l.description}`) ?? 0) + l.qty);
    }
    const mine = new Map(order?.lines.map((l) => [l.pos, l]) ?? []);
    return quote.lines
      .filter((l) => l.kind === "item")
      .map((l) => {
        const pos = l.pos ?? 0;
        const prev = before.get(`${pos}|${l.description}`) ?? 0;
        const open = l.qty == null ? null : Math.max(0, round2(l.qty - prev));
        const m = mine.get(pos);
        const on = order ? !!m : open == null ? prev === 0 : open > 0;
        return {
          pos,
          description: l.description,
          unit: l.unit,
          quotedQty: l.qty,
          quotedRate: l.rate,
          before: prev,
          on,
          qty: m ? String(m.qty) : on && open != null ? String(open) : "",
          rate: m?.rate != null ? String(m.rate) : l.rate != null ? String(l.rate) : "",
        };
      });
  });
  const anyBefore = rows.some((r) => r.before > 0);

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const toggle = (i: number, on: boolean) => {
    const r = rows[i];
    const open = r.quotedQty == null ? null : Math.max(0, round2(r.quotedQty - r.before));
    set(i, { on, qty: on ? (r.qty || (open != null && open > 0 ? String(open) : r.quotedQty != null ? String(r.quotedQty) : "")) : r.qty });
  };
  const all = (on: boolean) => rows.forEach((_, i) => toggle(i, on));

  const picked = rows.filter((r) => r.on && (n(r.qty) ?? 0) > 0);
  const value = round2(picked.reduce((s, r) => s + (n(r.qty) ?? 0) * (n(r.rate) ?? 0), 0));
  const pct = quote.subtotal > 0 ? Math.round((value / quote.subtotal) * 100) : 0;

  const fileIn = useMemo(() => order?.files ?? [], [order]);

  async function save() {
    if (!picked.length) return toast("Tick at least one line the customer ordered.", true);
    setBusy(true);
    try {
      const payload = { po_number: poNumber, po_date: poDate, note, lines: picked.map((r) => ({ pos: r.pos, qty: n(r.qty), rate: n(r.rate) })) };
      const res = order
        ? await api.put<{ order_id: number; quote: Quote }>(`/quotes/${quote.id}/orders/${order.id}`, payload)
        : await api.post<{ order_id: number; quote: Quote }>(`/quotes/${quote.id}/orders`, payload);
      let q = res.quote;
      if (file) {
        try {
          const f = await uploadFile("q_order", res.order_id, file);
          q = { ...q, orders: q.orders.map((o) => (o.id === res.order_id ? { ...o, files: [...o.files, f] } : o)) };
        } catch (e) {
          toast(`Order saved, but the PO file didn't upload: ${(e as Error).message}`, true);
        }
      }
      toast(q.status === "won" ? "Order recorded · quote won" : "Order recorded · partly won");
      props.onSaved(q);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      opened
      onClose={props.onClose}
      size={1100}
      fullScreen={small}
      title={<Text fw={700} ff="heading" fz="lg">{order ? "Edit Purchase Order" : "Record Purchase Order"} · {quoteNo(quote.base_number, quote.rev)}</Text>}
    >
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <TextInput label="PO Number" value={poNumber} onChange={(e) => setPoNumber(e.currentTarget.value)} data-autofocus />
          <DateInput label="PO Date" valueFormat="DD MMM YYYY" value={poDate} onChange={(v) => v && setPoDate(String(v).slice(0, 10))} />
          <div>
            <Text fz="sm" fw={500} mb={4}>PO Document</Text>
            {file ? (
              <Group gap={6} wrap="nowrap" h={36}>
                <IconPaperclip size={16} />
                <Text fz="sm" truncate>{file.name}</Text>
                <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setFile(null)} leftSection={<IconX size={12} />}>Remove</Button>
              </Group>
            ) : fileIn.length ? (
              <Group gap={6} h={36}>
                {fileIn.map((f) => <Anchor key={f.id} href={`/api/files/${f.id}`} target="_blank" fz="sm"><IconPaperclip size={14} style={{ verticalAlign: -2 }} /> {f.name}</Anchor>)}
              </Group>
            ) : (
              <Dropzone onDrop={(f) => f[0] && setFile(f[0])} maxSize={8 * 1024 * 1024} multiple={false} accept={["application/pdf", "image/*"]} p={6} radius="sm">
                <Group justify="center" gap={6} style={{ pointerEvents: "none" }}>
                  <IconFileUpload size={18} color="var(--mantine-color-dimmed)" />
                  <Text fz="sm" c="dimmed">Attach PDF or Image</Text>
                </Group>
              </Dropzone>
            )}
          </div>
        </SimpleGrid>

        <Group justify="flex-end" gap="xs">
          <Group gap={6}>
            <Button size="compact-sm" variant="default" onClick={() => all(true)}>Select All</Button>
            <Button size="compact-sm" variant="default" onClick={() => all(false)}>Clear All</Button>
          </Group>
        </Group>

        <Paper p={0}>
          <ScrollArea.Autosize mah={small ? undefined : "48vh"}>
            <Table verticalSpacing={6} miw={760} stickyHeader className="order-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={36} />
                  <Table.Th>Item</Table.Th>
                  <Table.Th ta="right" w={100}>Quoted Qty</Table.Th>
                  {anyBefore && <Table.Th ta="right" w={100}>Previously Ordered</Table.Th>}
                  <Table.Th ta="right" w={110}>Order Qty</Table.Th>
                  <Table.Th ta="right" w={120}>PO Rate ({cur})</Table.Th>
                  <Table.Th ta="right" w={120}>Amount ({cur})</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((r, i) => {
                  const q = n(r.qty);
                  const rt = n(r.rate);
                  const rateChanged = r.on && rt != null && r.quotedRate != null && rt !== r.quotedRate;
                  const over = r.on && q != null && r.quotedQty != null && q + r.before > r.quotedQty;
                  return (
                    <Table.Tr key={i} className={r.on ? "on" : "off"} onClick={(e) => (e.target as HTMLElement).tagName !== "INPUT" && toggle(i, !r.on)}>
                      <Table.Td><Checkbox checked={r.on} onChange={(e) => toggle(i, e.currentTarget.checked)} aria-label="Ordered" /></Table.Td>
                      <Table.Td>
                        <Text fz="sm" lineClamp={2} style={{ whiteSpace: "pre-line" }}>{r.description || "—"}</Text>
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace" fz="sm" c="dimmed">{qtyFmt(r.quotedQty)} {r.unit}</Table.Td>
                      {anyBefore && <Table.Td ta="right" ff="monospace" fz="sm" c="dimmed">{r.before ? qtyFmt(r.before) : ""}</Table.Td>}
                      <Table.Td>
                        <TextInput
                          size="xs"
                          disabled={!r.on}
                          inputMode="decimal"
                          value={r.qty}
                          onChange={(e) => set(i, { qty: e.currentTarget.value })}
                          styles={{ input: { textAlign: "right", fontFamily: "var(--mantine-font-family-monospace)" } }}
                          error={over ? "Exceeds quoted qty" : undefined}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          size="xs"
                          disabled={!r.on}
                          inputMode="decimal"
                          value={r.rate}
                          onChange={(e) => set(i, { rate: e.currentTarget.value })}
                          styles={{ input: { textAlign: "right", fontFamily: "var(--mantine-font-family-monospace)" } }}
                          description={rateChanged ? `Quoted ${money(r.quotedRate)}` : undefined}
                          inputWrapperOrder={["input", "description"]}
                        />
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace" fz="sm">{r.on && q != null && rt != null ? money(q * rt) : ""}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        </Paper>

        <Textarea label="Notes" autosize minRows={1} value={note} onChange={(e) => setNote(e.currentTarget.value)} />

        <Group justify="space-between" wrap="wrap" gap="sm">
          <div>
            <Text fz="xs" c="dimmed" fw={600}>Order Value (excl. VAT)</Text>
            <Text fw={700} fz="xl">{cur} {money(value)}</Text>
            <Text fz="sm" c="dimmed">{picked.length} of {rows.length} lines · {pct}% of quotation</Text>
          </div>
          <Group gap="sm">
            <Button variant="default" onClick={props.onClose}>Cancel</Button>
            <Button color="green" size="md" leftSection={<IconCheck size={18} />} loading={busy} onClick={save} disabled={!picked.length}>
              Save
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
