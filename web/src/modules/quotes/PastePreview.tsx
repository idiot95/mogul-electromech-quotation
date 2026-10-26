import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Checkbox, Group, Kbd, List, Modal, NativeSelect, Paper, ScrollArea, SegmentedControl, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconCheck, IconClipboardText, IconHash } from "@tabler/icons-react";
import { analysePaste, type PasteInput, type ParsedItem, type Role } from "../../../../shared/paste-engine";
import { qtyFmt } from "../../lib/format";

const ROLES: { value: Role; label: string }[] = [
  { value: "sr", label: "Sr No" },
  { value: "desc", label: "Description" },
  { value: "append", label: "Add to description" },
  { value: "qty", label: "Qty" },
  { value: "unit", label: "Unit" },
  { value: "rate", label: "Rate" },
  { value: "ignore", label: "Ignore" },
];

export type PasteMode = "append" | "replace" | "insert";

export function PastePreview(props: {
  input: PasteInput;
  hasLines: boolean;
  canInsert: boolean;
  enquiryEmpty: boolean;
  onCancel: () => void;
  onConfirm: (items: ParsedItem[], mode: PasteMode, enquiry: string | null) => void;
}) {
  const [overrides, setOverrides] = useState<Record<number, Role>>({});
  const res = useMemo(() => analysePaste(props.input, overrides), [props.input, overrides]);
  const [mode, setMode] = useState<PasteMode>("append");
  const [useEnq, setUseEnq] = useState(true);
  const count = res.items.filter((i) => !i.heading).length;
  const headings = res.items.length - count;

  const confirm = () => props.onConfirm(res.items, props.hasLines ? mode : "append", useEnq && props.enquiryEmpty ? res.enquiry : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !(e.target instanceof HTMLSelectElement) && count > 0) {
        e.preventDefault();
        confirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  let sr = 0;
  return (
    <Modal
      opened
      onClose={props.onCancel}
      size="xl"
      title={
        <Group gap="xs">
          <IconClipboardText size={20} />
          <Text fw={700} ff="heading" fz="lg">Paste preview</Text>
        </Group>
      }
    >
      <Stack gap="md">
        <Group gap="xs">
          <Badge variant="light" color="stamp">{res.source}</Badge>
          <Badge variant="light">{count} line{count === 1 ? "" : "s"}</Badge>
          {headings > 0 && <Badge variant="light" color="gray">{headings} section heading{headings === 1 ? "" : "s"}</Badge>}
        </Group>

        {res.enquiry && props.enquiryEmpty && (
          <Alert color="stamp" variant="light" icon={<IconHash size={18} />} p="xs">
            <Checkbox
              checked={useEnq}
              onChange={(e) => setUseEnq(e.currentTarget.checked)}
              label={<>Enquiry reference found: <b>{res.enquiry}</b> — fill the Enquiry ref field</>}
            />
          </Alert>
        )}

        {res.cols.length > 0 && (
          <div>
            <Text fz="xs" tt="uppercase" fw={600} c="dimmed" ff="monospace" mb={6}>Column mapping · change any</Text>
            <Group gap="xs" align="flex-start">
              {res.cols.map((c, i) => (
                <Paper key={i} p={6} w={150} bg={c.role === "ignore" ? "gray.0" : "maroon.0"} style={{ borderColor: c.role === "ignore" ? undefined : "var(--mantine-color-maroon-3)" }}>
                  <Tooltip label={c.label} openDelay={400}>
                    <Text fz="xs" fw={700} truncate mb={4}>{c.label}</Text>
                  </Tooltip>
                  <NativeSelect size="xs" value={c.role} data={ROLES} onChange={(e) => setOverrides({ ...overrides, [i]: e.currentTarget.value as Role })} />
                </Paper>
              ))}
            </Group>
          </div>
        )}

        {res.notes.length > 0 && (
          <List size="sm" c="teal.8" spacing={2} icon={<IconCheck size={14} />}>
            {res.notes.map((n) => <List.Item key={n}>{n}</List.Item>)}
          </List>
        )}

        <ScrollArea.Autosize mah="45vh">
          <Table withTableBorder striped stickyHeader fz="sm">
            <Table.Thead>
              <Table.Tr><Table.Th w={50}>Sr</Table.Th><Table.Th>Description</Table.Th><Table.Th ta="right" w={80}>Qty</Table.Th><Table.Th w={80}>Unit</Table.Th><Table.Th ta="right" w={90}>Rate</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {res.items.map((it, i) =>
                it.heading ? (
                  <Table.Tr key={i} bg="gray.1"><Table.Td /><Table.Td colSpan={4} fw={700} c="maroon.7">{it.desc}</Table.Td></Table.Tr>
                ) : (
                  <Table.Tr key={i}>
                    <Table.Td>{++sr}</Table.Td>
                    <Table.Td style={{ whiteSpace: "pre-line" }}>{it.desc}</Table.Td>
                    <Table.Td ta="right">
                      {it.flag ? <Tooltip label="No quantity found — set to 1"><Text span c="orange.8" td="underline" fz="sm">{qtyFmt(it.qty)}</Text></Tooltip> : qtyFmt(it.qty)}
                    </Table.Td>
                    <Table.Td>{it.unit}</Table.Td>
                    <Table.Td ta="right">{it.rate ?? <Text span c="dimmed">—</Text>}</Table.Td>
                  </Table.Tr>
                ),
              )}
              {!res.items.length && <Table.Tr><Table.Td colSpan={5}><Text c="dimmed" ta="center" py="md">Nothing recognisable in the pasted content.</Text></Table.Td></Table.Tr>}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>

        <Text fz="xs" c="dimmed">Rates are typed in after adding. Underlined quantities weren't found in the paste and were set to 1.</Text>

        <Group justify="space-between">
          {props.hasLines ? (
            <SegmentedControl
              size="xs"
              value={mode}
              onChange={(v) => setMode(v as PasteMode)}
              data={[
                { value: "append", label: "Add after existing" },
                ...(props.canInsert ? [{ value: "insert", label: "Insert at cursor" }] : []),
                { value: "replace", label: "Replace all lines" },
              ]}
            />
          ) : <span />}
          <Group gap="sm">
            <Button variant="default" onClick={props.onCancel}>Cancel</Button>
            <Button disabled={!count} onClick={confirm} rightSection={<Kbd size="xs">Enter</Kbd>}>
              Add {count} line{count === 1 ? "" : "s"}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
