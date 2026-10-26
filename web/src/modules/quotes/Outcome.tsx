import { useState } from "react";
import { ActionIcon, Anchor, Button, Chip, Group, Modal, Paper, Progress, Stack, Text, Textarea, Title, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconPaperclip, IconPencil, IconPlus, IconRefresh, IconThumbDown, IconTrash, IconTrophy } from "@tabler/icons-react";
import { api } from "../../lib/api";
import type { Order, Quote } from "../../lib/types";
import { dateFmt, money, round2 } from "../../lib/format";
import { useApp } from "../../core/app-context";
import { OrderDialog } from "./OrderDialog";
import { LOST_REASONS } from "./status";

const poLabel = (n: string | null) => (!n ? "PO (no number)" : /^p\.?o\b/i.test(n) ? n : `PO ${n}`);

/** Customer's decision on a quote: record the PO(s) received, or mark it lost. */
export function Outcome(props: { quote: Quote; readOnly: boolean; beforeAction: () => Promise<boolean>; onChange: (q: Quote) => void }) {
  const { quote, readOnly } = props;
  const { toast } = useApp();
  const [orderDlg, setOrderDlg] = useState<{ order?: Order } | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const cur = quote.currency || "AED";
  const orders = quote.orders || [];

  if (quote.status === "cancelled" || (readOnly && !orders.length && quote.status !== "lost")) return null;

  const open = async (fn: () => void) => {
    if (await props.beforeAction()) fn();
  };
  const call = async (p: Promise<Quote>, msg: string) => {
    try {
      props.onChange(await p);
      toast(msg);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const delOrder = (o: Order) =>
    modals.openConfirmModal({
      title: `Delete ${poLabel(o.po_number)}?`,
      children: <Text fz="sm">The order and its attached PO copy are removed. The quote status is worked out again from the orders left.</Text>,
      labels: { confirm: "Delete order", cancel: "Keep" },
      confirmProps: { color: "red" },
      onConfirm: () => call(api.del<Quote>(`/quotes/${quote.id}/orders/${o.id}`), "Order deleted"),
    });

  const ordered = round2(orders.reduce((s, o) => s + o.subtotal, 0));
  const pct = quote.subtotal > 0 ? Math.min(100, Math.round((ordered / quote.subtotal) * 100)) : 0;

  return (
    <Paper p="lg">
      {quote.status === "lost" ? (
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>Lost</Title>
            {!readOnly && <Button size="compact-sm" variant="subtle" leftSection={<IconRefresh size={14} />} onClick={() => call(api.post<Quote>(`/quotes/${quote.id}/reopen`), "Re-opened")}>Re-open</Button>}
          </Group>
          <Text fz="sm"><b>Reason:</b> {quote.lost_reason || "Other"}</Text>
          {quote.lost_note && <Text fz="sm" c="dimmed" style={{ whiteSpace: "pre-line" }}>{quote.lost_note}</Text>}
        </Stack>
      ) : orders.length ? (
        <Stack gap="sm">
          <Group justify="space-between" align="baseline">
            <Title order={5}>{quote.status === "won" ? "Won" : "Partly won"}</Title>
            <Text fz="sm" c="dimmed">{pct}% of quote</Text>
          </Group>
          <div>
            <Text fw={800} ff="heading" fz="xl">{cur} {money(ordered)}</Text>
            <Text fz="xs" c="dimmed">ordered of {money(quote.subtotal)} quoted · excl. VAT</Text>
            <Progress value={pct} color="green" size="sm" radius="xl" mt={8} />
          </div>
          <Stack gap={6}>
            {orders.map((o) => (
              <Group key={o.id} justify="space-between" wrap="nowrap" gap="xs" className="po-row">
                <div style={{ minWidth: 0 }}>
                  <Text fz="sm" fw={600} truncate>
                    {poLabel(o.po_number)}
                    {o.files.map((f) => (
                      <Tooltip key={f.id} label={f.name}>
                        <Anchor href={`/api/files/${f.id}`} target="_blank" ml={6} c="dimmed" aria-label="Open PO copy"><IconPaperclip size={14} style={{ verticalAlign: -2 }} /></Anchor>
                      </Tooltip>
                    ))}
                  </Text>
                  <Text fz="xs" c="dimmed">{dateFmt(o.po_date || o.created_at)} · {o.lines.length} line{o.lines.length === 1 ? "" : "s"} · {money(o.subtotal)}</Text>
                </div>
                {!readOnly && (
                  <Group gap={2} wrap="nowrap">
                    <ActionIcon variant="subtle" color="gray" aria-label="Edit order" onClick={() => open(() => setOrderDlg({ order: o }))}><IconPencil size={16} /></ActionIcon>
                    <ActionIcon variant="subtle" color="red" aria-label="Delete order" onClick={() => delOrder(o)}><IconTrash size={16} /></ActionIcon>
                  </Group>
                )}
              </Group>
            ))}
          </Stack>
          {!readOnly && (
            <Button variant={quote.status === "won" ? "default" : "light"} color="green" leftSection={<IconPlus size={16} />} onClick={() => open(() => setOrderDlg({}))}>
              {quote.status === "won" ? "Add another PO" : "Record another PO"}
            </Button>
          )}
        </Stack>
      ) : (
        <Stack gap="sm">
          <div>
            <Title order={5}>Customer's decision</Title>
            <Text fz="sm" c="dimmed">Got a PO, or a no? Record it here.</Text>
          </div>
          <Button color="green" size="md" leftSection={<IconTrophy size={18} />} onClick={() => open(() => setOrderDlg({}))}>We got the order</Button>
          <Button variant="default" leftSection={<IconThumbDown size={16} />} onClick={() => open(() => setLostOpen(true))}>Lost</Button>
        </Stack>
      )}

      {orderDlg && (
        <OrderDialog quote={quote} order={orderDlg.order} onClose={() => setOrderDlg(null)} onSaved={(q) => { props.onChange(q); setOrderDlg(null); }} />
      )}
      {lostOpen && (
        <LostDialog
          onClose={() => setLostOpen(false)}
          onSave={async (reason, note) => {
            await call(api.post<Quote>(`/quotes/${quote.id}/lost`, { reason, note }), "Marked lost");
            setLostOpen(false);
          }}
        />
      )}
    </Paper>
  );
}

function LostDialog(props: { onClose: () => void; onSave: (reason: string, note: string) => Promise<void> }) {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal opened onClose={props.onClose} title={<Text fw={700} ff="heading" fz="lg">Why was it lost?</Text>}>
      <Stack gap="md">
        <Chip.Group value={reason} onChange={(v) => setReason(v as string)}>
          <Group gap={8}>
            {LOST_REASONS.map((r) => <Chip key={r} value={r} variant="outline">{r}</Chip>)}
          </Group>
        </Chip.Group>
        <Textarea label="Note (optional)" placeholder="e.g. competitor quoted 12% lower, customer bought ABB" autosize minRows={2} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>Cancel</Button>
          <Button
            color="orange"
            disabled={!reason}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await props.onSave(reason!, note);
              setBusy(false);
            }}
          >
            Mark lost
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
