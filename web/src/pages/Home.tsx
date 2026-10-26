import { Stack } from "@mantine/core";
import { modules } from "../modules";

export function HomePage() {
  return <Stack gap="lg">{modules.flatMap((m) => (m.widgets || []).map((W, i) => <W key={m.id + i} />))}</Stack>;
}
