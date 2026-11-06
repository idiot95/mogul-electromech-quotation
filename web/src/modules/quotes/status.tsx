import { Badge } from "@mantine/core";
import type { QuoteStatus } from "../../lib/types";

const COLORS: Record<QuoteStatus, string> = { draft: "gray", printed: "stamp", emailed: "cyan", won: "green", partly_won: "lime", lost: "orange", cancelled: "red" };
export const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Draft",
  printed: "Printed",
  emailed: "Sent",
  won: "Won",
  partly_won: "Partly Won",
  lost: "Lost",
  cancelled: "Cancelled",
};

export function StatusBadge({ s, size = "sm" }: { s: QuoteStatus; size?: "xs" | "sm" | "md" }) {
  return (
    <Badge variant="light" color={COLORS[s]} size={size} td={s === "cancelled" ? "line-through" : undefined}>
      {STATUS_LABEL[s]}
    </Badge>
  );
}

export const LOST_REASONS = ["Price", "Delivery time", "No response", "Went to competitor", "Brand / spec", "Enquiry cancelled", "Other"];

export function RevBadge({ rev }: { rev: number }) {
  return rev > 0 ? <Badge variant="outline" color="stamp" size="xs" radius="xs" ml={6}>REV {String(rev).padStart(2, "0")}</Badge> : null;
}
