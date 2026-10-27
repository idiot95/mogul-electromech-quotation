import { useEffect, useState } from "react";
import { ActionIcon, Anchor, Button, Group, Image, Modal, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { IconCamera, IconClipboard, IconFile, IconX } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { api } from "../../lib/api";
import { uploadFile } from "../../lib/upload";
import type { FileRow } from "../../lib/types";
import { useApp } from "../../core/app-context";

export function Workings(props: { quoteId: number | null; readOnly?: boolean; version?: number }) {
  const { toast } = useApp();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<FileRow | null>(null);

  const load = () => props.quoteId && api.get<FileRow[]>(`/files?owner_type=quote&owner_id=${props.quoteId}`).then(setFiles);
  useEffect(() => {
    load();
  }, [props.quoteId, props.version]);

  async function upload(list: File[]) {
    if (!props.quoteId || !list.length) return;
    setBusy(true);
    try {
      const added = await Promise.all(list.map((f) => uploadFile("quote", props.quoteId!, f)));
      setFiles((fs) => [...fs, ...added]);
      toast(list.length > 1 ? `${list.length} workings uploaded` : "Working uploaded");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      const out: File[] = [];
      for (const it of items) {
        const t = it.types.find((x) => x.startsWith("image/"));
        if (t) out.push(new File([await it.getType(t)], `screenshot-${Date.now()}.png`, { type: t }));
      }
      if (out.length) upload(out);
      else toast("No image on the clipboard. Take a screenshot first (Win+Shift+S).", true);
    } catch {
      toast("Click inside the Workings box and press Ctrl+V to paste a screenshot.", true);
    }
  }

  const remove = (f: FileRow) =>
    modals.openConfirmModal({
      title: "Delete working?",
      children: <Text fz="sm">{f.name}</Text>,
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await api.del(`/files/${f.id}`);
        load();
      },
    });

  return (
    <Paper
      p="md"
      tabIndex={-1}
      data-workings
      onPaste={(e) => {
        const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
        if (imgs.length) {
          e.preventDefault();
          e.stopPropagation();
          upload(imgs);
        }
      }}
    >
      <Title order={5} mb="md">Workings</Title>
      {!props.quoteId ? (
        <Text fz="sm" c="dimmed">Available after saving.</Text>
      ) : (
        <Stack gap="sm">
          {files.length > 0 && (
            <SimpleGrid cols={3} spacing={6}>
              {files.map((f) => (
                <Paper key={f.id} pos="relative" style={{ aspectRatio: "1", overflow: "hidden" }} title={f.name}>
                  {f.mime.startsWith("image/") ? (
                    <Image src={`/api/files/${f.id}`} alt={f.name} h="100%" fit="cover" style={{ cursor: "zoom-in" }} onClick={() => setView(f)} />
                  ) : (
                    <Stack align="center" justify="center" h="100%" gap={2} p={4}>
                      <IconFile size={20} />
                      <Anchor href={`/api/files/${f.id}`} target="_blank" fz={10} lineClamp={2} ta="center">{f.name}</Anchor>
                    </Stack>
                  )}
                  {!props.readOnly && (
                    <ActionIcon size="xs" color="dark" variant="filled" pos="absolute" top={3} right={3} onClick={() => remove(f)} aria-label="Delete">
                      <IconX size={11} />
                    </ActionIcon>
                  )}
                </Paper>
              ))}
            </SimpleGrid>
          )}
          {!props.readOnly && (
            <>
              <Dropzone onDrop={upload} loading={busy} maxSize={8 * 1024 * 1024} accept={["image/*", "application/pdf", ".xlsx", ".xls", ".csv"]} p="sm" radius="md">
                <Group justify="center" gap="xs" mih={50} style={{ pointerEvents: "none" }}>
                  <IconCamera size={22} color="var(--mantine-color-stamp-6)" />
                  <Text fz="sm" c="dimmed">Add File</Text>
                </Group>
              </Dropzone>
              <Button size="xs" variant="light" color="stamp" leftSection={<IconClipboard size={14} />} onClick={pasteFromClipboard}>Paste Screenshot</Button>
            </>
          )}
        </Stack>
      )}
      <Modal opened={!!view} onClose={() => setView(null)} size="auto" title={view?.name} centered>
        {view && <Image src={`/api/files/${view.id}`} alt={view.name} mah="80vh" fit="contain" />}
      </Modal>
    </Paper>
  );
}
