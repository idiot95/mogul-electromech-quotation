import type { ReactNode } from "react";
import { Group, Stack, Title } from "@mantine/core";

export function Page(props: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <Stack gap="lg" pb={60} className="page-stack">
      {(props.title || props.actions) && (
        <Group justify="space-between" align="center" className="no-print" wrap="wrap">
          {typeof props.title === "string" ? <Title order={2}>{props.title}</Title> : props.title}
          {props.actions && <Group gap="sm">{props.actions}</Group>}
        </Group>
      )}
      {props.children}
    </Stack>
  );
}
