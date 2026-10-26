import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Checkbox, Flex, Group, Image, List, Modal, NativeSelect, Paper, ScrollArea, SegmentedControl, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconCheck, IconClipboardText, IconEye, IconHash } from "@tabler/icons-react";
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
  /** Pictures of the original (PDF pages, screenshot), shown beside the lines to compare. */
  previews?: string[];
  /** Read by OCR: ask for a check. */
  ocr?: boolean;
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
      size={props.previews?.length ? "min(1440px, 96vw)" : "xl"}
      title={
        <Group gap="xs">
          <IconClipboardText size={20} />
          <Text fw={700} ff="heading" fz="lg">Import Preview</Text>
        </Group>
      }
    >
      <Flex direction={{ base: "column", md: "row" }} gap="lg" align="flex-start">
      {props.previews && props.previews.length > 0 && (
        <Paper p={0} w={{ base: "100%", md: "42%" }} style={{ flexShrink: 0, overflow: "hidden" }}>
          <Text fz="sm" fw={600} px="sm" py={8} bg="gray.0">Original Document</Text>
          <ScrollArea.Autosize mah="72vh">
            <Stack gap={4} p={4}>
              {props.previews.map((src, i) => <Image key={i} src={src} alt={`Page ${i + 1}`} radius="xs" />)}
            </Stack>
          </ScrollArea.Autosize>
        </Paper>
      )}
      <Stack gap="md" style={{ flex: 1, minWidth: 0 }} w="100%">
        {props.ocr && (
          <Alert color="orange" variant="light" icon={<IconEye size={18} />} p="xs">
            Extracted by OCR. Verify against the original.
          </Alert>
        )}
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
              label={<>Set Enquiry Reference to <b>{res.enquiry}</b></>}
            />
          </Alert>
        )}

        {res.cols.length > 0 && (
          <div>
            <Text fz="sm" fw={600} mb={8}>Column Mapping</Text>
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


        <Group justify="space-between">
          {props.hasLines ? (
            <SegmentedControl
              size="xs"
              value={mode}
              onChange={(v) => setMode(v as PasteMode)}
              data={[
                { value: "append", label: "Append" },
                ...(props.canInsert ? [{ value: "insert", label: "Insert at Selection" }] : []),
                { value: "replace", label: "Replace All" },
              ]}
            />
          ) : <span />}
          <Group gap="sm">
            <Button variant="default" onClick={props.onCancel}>Cancel</Button>
            <Button disabled={!count} onClick={confirm}>
              Add {count} line{count === 1 ? "" : "s"}
            </Button>
          </Group>
        </Group>
      </Stack>
      </Flex>
    </Modal>
  );
}
