import { useEffect, useState } from "react";
import { ActionIcon, Anchor, Button, Group, Image, Modal, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { IconCamera, IconClipboard, IconFile, IconX } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { api } from "../../lib/api";
import type { FileRow } from "../../lib/types";
import { useApp } from "../../core/app-context";

/** Resize photos in the browser (~1600px, JPEG) so uploads stay around 300 KB. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 350_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function Workings(props: { quoteId: number | null; readOnly?: boolean }) {
  const { toast } = useApp();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<FileRow | null>(null);

  const load = () => props.quoteId && api.get<FileRow[]>(`/files?owner_type=quote&owner_id=${props.quoteId}`).then(setFiles);
  useEffect(() => {
    load();
  }, [props.quoteId]);

  async function upload(list: File[]) {
    if (!props.quoteId || !list.length) return;
    setBusy(true);
    try {
      for (const f of list) {
        const fd = new FormData();
        fd.append("file", await shrink(f));
        fd.append("owner_type", "quote");
        fd.append("owner_id", String(props.quoteId));
        await api.post("/files", fd);
      }
      toast(list.length > 1 ? `${list.length} workings uploaded` : "Working uploaded");
      await load();
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
      <Group justify="space-between" mb="xs">
        <Title order={5}>Workings</Title>
        <Text fz="xs" c="dimmed">internal · never printed</Text>
      </Group>
      {!props.quoteId ? (
        <Text fz="sm" c="dimmed">Save the quote first, then attach photos or screenshots of your working.</Text>
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
                  <Text fz="sm" c="dimmed">Drop or tap to add a photo / file</Text>
                </Group>
              </Dropzone>
              <Button size="xs" variant="light" color="stamp" leftSection={<IconClipboard size={14} />} onClick={pasteFromClipboard}>Paste screenshot</Button>
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
