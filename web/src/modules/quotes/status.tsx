import { Badge } from "@mantine/core";
import type { QuoteStatus } from "../../lib/types";

const COLORS: Record<QuoteStatus, string> = { draft: "gray", printed: "stamp", emailed: "teal", cancelled: "red" };

export function StatusBadge({ s, size = "sm" }: { s: QuoteStatus; size?: "xs" | "sm" | "md" }) {
  return <Badge variant="light" color={COLORS[s]} size={size} td={s === "cancelled" ? "line-through" : undefined}>{s}</Badge>;
}

export function RevBadge({ rev }: { rev: number }) {
  return rev > 0 ? <Badge variant="outline" color="stamp" size="xs" radius="xs" ml={6}>REV {String(rev).padStart(2, "0")}</Badge> : null;
}
