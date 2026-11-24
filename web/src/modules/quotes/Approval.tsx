import { useState } from "react";
import { Alert, Badge, Button, Group, Modal, Paper, Stack, Text, Textarea, Timeline, Title, UnstyledButton } from "@mantine/core";
import { IconArrowBackUp, IconCheck, IconChevronDown, IconChevronUp, IconSend, IconX } from "@tabler/icons-react";
import { api } from "../../lib/api";
import type { ApprovalStatus, ApprovalStep, Quote } from "../../lib/types";
import { dateFmt } from "../../lib/format";
import { useApp } from "../../core/app-context";

const LABEL: Record<ApprovalStatus, { text: string; color: string }> = {
  none: { text: "Not sent", color: "gray" },
  pending: { text: "Waiting for approval", color: "yellow" },
  approved: { text: "Approved", color: "green" },
  returned: { text: "Changes requested", color: "orange" },
};

export function ApprovalBadge({ s, size = "sm" }: { s: ApprovalStatus; size?: "xs" | "sm" | "md" }) {
  if (s === "none") return null;
  return <Badge variant="light" color={LABEL[s].color} size={size}>{LABEL[s].text}</Badge>;
}

const STEP: Record<ApprovalStep["action"], { text: string; color: string }> = {
  submitted: { text: "Sent for approval", color: "yellow" },
  withdrawn: { text: "Withdrawn", color: "gray" },
  approved: { text: "Approved", color: "green" },
  returned: { text: "Returned", color: "orange" },
  reset: { text: "Changed after approval", color: "gray" },
};
const when = (s: string) => `${dateFmt(s)} ${s.slice(11, 16)}`;

type Action = "submit" | "withdraw" | "approve" | "return";

/** Admin approval of a quotation: send, withdraw, approve or return with a note; and the history. */
export function Approval(props: { quote: Quote; dirty: boolean; beforeAction: () => Promise<boolean>; onChange: (q: Quote) => void }) {
  const { quote } = props;
  const { isAdmin, toast } = useApp();
  const [ask, setAsk] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const s = quote.approval_status;
  const steps = quote.approvals || [];
  const last = steps[steps.length - 1];

  if (quote.superseded_by && !steps.length) return null;
  if (quote.status === "cancelled" && s === "none") return null;

  async function run(action: Action, withNote = "") {
    if ((action === "submit" || action === "approve") && !(await props.beforeAction())) return;
    setBusy(true);
    try {
      props.onChange(await api.post<Quote>(`/quotes/${quote.id}/approval`, { action, note: withNote }));
      toast({ submit: "Sent for approval", withdraw: "Withdrawn", approve: "Approved", return: "Returned with your note" }[action]);
      setAsk(null);
      setNote("");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  const locked = !!quote.superseded_by || quote.status === "cancelled";
  return (
    <Paper p="lg">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Title order={5}>Approval</Title>
          <Badge variant="light" color={LABEL[s].color}>{LABEL[s].text}</Badge>
        </Group>

        {s === "returned" && last?.action === "returned" && (
          <Alert color="orange" variant="light" p="xs" title={`Returned by ${last.user_name || "an admin"}`}>
            <Text fz="sm" style={{ whiteSpace: "pre-line" }}>{last.note}</Text>
          </Alert>
        )}
        {s === "pending" && last?.action === "submitted" && (
          <Text fz="sm" c="dimmed">
            Sent by {last.user_name} · {when(last.created_at)}
            {last.note && <Text span display="block" c="dark" mt={4} style={{ whiteSpace: "pre-line" }}>“{last.note}”</Text>}
          </Text>
        )}
        {s === "approved" && last?.action === "approved" && (
          <Text fz="sm" c="dimmed">
            By {last.user_name} · {when(last.created_at)}
            {last.note && <Text span display="block" c="dark" mt={4} style={{ whiteSpace: "pre-line" }}>“{last.note}”</Text>}
          </Text>
        )}
        {s === "approved" && props.dirty && <Text fz="sm" c="orange.8">Saving these changes will need approval again.</Text>}

        {!locked && (
          <Stack gap={8}>
            {(s === "none" || s === "returned") && (
              <Button leftSection={<IconSend size={16} />} onClick={() => setAsk("submit")} loading={busy}>
                {s === "returned" ? "Send Again for Approval" : "Send for Approval"}
              </Button>
            )}
            {s === "pending" && isAdmin && (
              <Group grow gap={8}>
                <Button color="green" leftSection={<IconCheck size={16} />} onClick={() => setAsk("approve")} loading={busy}>Approve</Button>
                <Button variant="default" leftSection={<IconArrowBackUp size={16} />} onClick={() => setAsk("return")} loading={busy}>Return</Button>
              </Group>
            )}
            {s === "pending" && <Button variant="subtle" color="gray" leftSection={<IconX size={16} />} onClick={() => run("withdraw")} loading={busy}>Withdraw</Button>}
          </Stack>
        )}

        {steps.length > 0 && (
          <div>
            <UnstyledButton onClick={() => setShowAll(!showAll)} fz="xs" c="dimmed" mb={showAll ? 8 : 0}>
              <Group gap={4}>History ({steps.length}) {showAll ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}</Group>
            </UnstyledButton>
            {showAll && (
              <Timeline bulletSize={12} lineWidth={2} active={steps.length}>
                {steps.map((a) => (
                  <Timeline.Item key={a.id} color={STEP[a.action].color} title={<Text fz="sm" fw={600}>{STEP[a.action].text}</Text>}>
                    <Text fz="xs" c="dimmed">{a.user_name} · {when(a.created_at)}</Text>
                    {a.note && <Text fz="xs" mt={2} style={{ whiteSpace: "pre-line" }}>{a.note}</Text>}
                  </Timeline.Item>
                ))}
              </Timeline>
            )}
          </div>
        )}
      </Stack>

      <Modal
        opened={!!ask && ask !== "withdraw"}
        onClose={() => setAsk(null)}
        title={<Text fw={700} ff="heading" fz="lg">{ask === "approve" ? "Approve Quotation" : ask === "return" ? "Return for Changes" : "Send for Approval"}</Text>}
      >
        <Stack gap="md">
          <Textarea
            label={ask === "return" ? "What needs to change" : "Note (optional)"}
            required={ask === "return"}
            autosize
            minRows={3}
            data-autofocus
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAsk(null)}>Cancel</Button>
            <Button
              color={ask === "approve" ? "green" : undefined}
              loading={busy}
              disabled={ask === "return" && !note.trim()}
              onClick={() => ask && run(ask, note.trim())}
            >
              {ask === "approve" ? "Approve" : ask === "return" ? "Return" : "Send"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
