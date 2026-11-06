import { api } from "./api";
import type { FileRow } from "./types";

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

/** Upload one file to a record (photos are shrunk first). */
export async function uploadFile(ownerType: "quote" | "q_order", ownerId: number, file: File): Promise<FileRow> {
  const fd = new FormData();
  fd.append("file", await shrink(file));
  fd.append("owner_type", ownerType);
  fd.append("owner_id", String(ownerId));
  return api.post<FileRow>("/files", fd);
}
