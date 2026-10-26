import { useEffect } from "react";
import { NavLink as RouterLink, Outlet, useLocation } from "react-router";
import { AppShell, Badge, Box, Burger, Button, Group, NavLink, ScrollArea, Text } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconHome, IconFileText, IconUsers, IconSettings, IconPlus } from "@tabler/icons-react";
import { modules } from "../modules";
import { useApp } from "./app-context";

const ICONS: Record<string, typeof IconHome> = { "/quotes": IconFileText };

function Brand() {
  return (
    <Group gap={10} wrap="nowrap">
      <Box component="span" fw={800} fz={16} px={7} py={1} bg="white" c="maroon.7" style={{ fontFamily: "var(--mantine-font-family-headings)", borderRadius: 2 }}>
        ME
      </Box>
      <Text fw={700} c="white" ff="heading">Mogul Workspace</Text>
    </Group>
  );
}

export function Shell() {
  const { env } = useApp();
  const [opened, { toggle, close }] = useDisclosure();
  const loc = useLocation();
  useEffect(close, [loc.pathname]);
  const staging = env && env !== "production";
  const desktop = useMediaQuery("(min-width: 62em)", true);

  const link = (to: string, label: string, Icon: typeof IconHome, end = false) => {
    const active = end ? loc.pathname === to : loc.pathname === to || loc.pathname.startsWith(to + "/");
    return (
      <NavLink
        key={to}
        component={RouterLink}
        to={to}
        label={label}
        leftSection={<Icon size={18} stroke={1.7} />}
        active={active}
        variant="filled"
        color="maroon"
        c={active ? undefined : "gray.3"}
        style={{ borderRadius: 6 }}
      />
    );
  };

  return (
    <AppShell
      header={{ height: 52, collapsed: desktop }}
      navbar={{ width: 230, breakpoint: "md", collapsed: { mobile: !opened } }}
      padding="lg"
    >
      <AppShell.Header className="no-print" bg="charcoal.8" withBorder={false}>
        <Group h="100%" px="md">
          <Burger opened={opened} onClick={toggle} size="sm" color="white" aria-label="Menu" />
          <Brand />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar className="no-print" bg="charcoal.8" p="sm" withBorder={false}>
        <Box py="xs" px={6} visibleFrom="md"><Brand /></Box>
        {modules.map((m) =>
          m.newAction ? (
            <Button key={m.id} component={RouterLink} to={m.newAction.path} leftSection={<IconPlus size={16} />} my="sm" fullWidth>
              {m.newAction.label}
            </Button>
          ) : null,
        )}
        <AppShell.Section grow component={ScrollArea}>
          {link("/", "Home", IconHome, true)}
          {modules.flatMap((m) => m.nav.map((n) => link(n.path, n.label, ICONS[n.path] || IconFileText)))}
          <Text fz={10} ff="monospace" tt="uppercase" c="gray.5" lts={1.2} px="sm" pt="md" pb={4}>Core</Text>
          {link("/customers", "Customers", IconUsers)}
          {link("/settings", "Settings", IconSettings)}
        </AppShell.Section>
        <Group px={6} pt="sm">
          {env && <Badge variant="outline" color={env === "production" ? "teal" : "yellow"} size="sm">{env === "production" ? "Live" : env}</Badge>}
        </Group>
      </AppShell.Navbar>

      <AppShell.Main bg="gray.0">
        {staging && (
          <Text ta="center" fz={12} fw={600} ff="monospace" bg="yellow.4" c="dark.8" py={4} mx="calc(var(--mantine-spacing-lg) * -1)" mt="calc(var(--mantine-spacing-lg) * -1)" mb="md" className="no-print">
            {env.toUpperCase()} · test data only · not the live system
          </Text>
        )}
        <Box maw={1440} mx="auto">
          <Outlet />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
