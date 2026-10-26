import type { ReactNode } from "react";
import { Link } from "react-router";
import { ActionIcon, Anchor, Breadcrumbs, Group, Stack, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";

export interface Crumb {
  label: string;
  to: string;
}

/** Page frame: back + breadcrumb and title on the left, page actions on the right. */
export function Page(props: { crumbs?: Crumb[]; title?: ReactNode; badges?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const back = props.crumbs?.[props.crumbs.length - 1];
  return (
    <Stack gap="lg" pb={60} className="page-stack">
      <Group justify="space-between" align="flex-end" className="no-print" wrap="wrap" gap="md">
        <Group gap="sm" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
          {back && (
            <ActionIcon component={Link} to={back.to} variant="default" size="lg" radius="md" aria-label={`Back to ${back.label}`}>
              <IconArrowLeft size={18} />
            </ActionIcon>
          )}
          <div style={{ minWidth: 0 }}>
            {props.crumbs && props.crumbs.length > 0 && (
              <Breadcrumbs separator="/" separatorMargin={6} mb={2}>
                {props.crumbs.map((c) => (
                  <Anchor key={c.to} component={Link} to={c.to} fz="sm" c="dimmed">{c.label}</Anchor>
                ))}
              </Breadcrumbs>
            )}
            <Group gap="sm" align="center" wrap="wrap">
              {typeof props.title === "string" ? <Title order={2}>{props.title}</Title> : props.title}
              {props.badges}
            </Group>
          </div>
        </Group>
        {props.actions && <Group gap="sm" wrap="wrap">{props.actions}</Group>}
      </Group>
      {props.children}
    </Stack>
  );
}

