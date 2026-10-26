import { useEffect } from "react";
import { NavLink as RouterLink, Outlet, useLocation } from "react-router";
import { AppShell, Badge, Box, Burger, Button, Group, NavLink, ScrollArea, Text } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconHome, IconFileText, IconUsers, IconSettings, IconPlus } from "@tabler/icons-react";
import { modules } from "../modules";
import { useApp } from "./app-context";

const ICONS: Record<string, typeof IconHome> = { "/quotes": IconFileText };

function Brand({ height = 58 }: { height?: number }) {
  return (
    <Box component={RouterLink} to="/" display="block" lh={0} aria-label="Mogul Electromech · Home">
      <img src="/logo.jpg" alt="Mogul Electromech LLC" style={{ height, width: "auto", display: "block" }} />
    </Box>
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
        variant="light"
        color="maroon"
        c={active ? "maroon.8" : "dark.6"}
        fw={active ? 700 : 500}
        className="side-link"
        data-active={active || undefined}
      />
    );
  };

  return (
    <AppShell
      header={{ height: 52, collapsed: desktop }}
      navbar={{ width: 248, breakpoint: "md", collapsed: { mobile: !opened } }}
      padding="lg"
    >
      <AppShell.Header className="no-print" bg="white">
        <Group h="100%" px="md" gap="sm">
          <Burger opened={opened} onClick={toggle} size="sm" aria-label="Menu" />
          <Brand height={34} />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar className="no-print side" bg="white" p="md">
        <Box pb="sm" pt={4} visibleFrom="md"><Brand /></Box>
        {modules.map((m) =>
          m.newAction ? (
            <Button key={m.id} component={RouterLink} to={m.newAction.path} leftSection={<IconPlus size={18} />} size="md" my="sm" fullWidth>
              {m.newAction.label}
            </Button>
          ) : null,
        )}
        <AppShell.Section grow component={ScrollArea}>
          {link("/", "Dashboard", IconHome, true)}
          {modules.flatMap((m) => m.nav.map((n) => link(n.path, n.label, ICONS[n.path] || IconFileText)))}
          <Text fz={11} fw={600} tt="uppercase" c="dimmed" lts={1} px="sm" pt="lg" pb={6}>Administration</Text>
          {link("/customers", "Customers", IconUsers)}
          {link("/settings", "Settings", IconSettings)}
        </AppShell.Section>
        <Group px={6} pt="sm" gap={6} style={{ borderTop: "1px solid var(--mantine-color-gray-2)" }}>
          {env && <Badge variant="dot" color={env === "production" ? "teal" : "yellow.7"} size="sm">{env === "production" ? "Production" : env === "staging" ? "Staging" : "Local"}</Badge>}
        </Group>
      </AppShell.Navbar>

      <AppShell.Main bg="gray.0">
        {staging && (
          <Text ta="center" fz={12} fw={600} ff="monospace" bg="yellow.4" c="dark.8" py={4} mx="calc(var(--mantine-spacing-lg) * -1)" mt="calc(var(--mantine-spacing-lg) * -1)" mb="md" className="no-print">
            {env === "staging" ? "Staging Environment" : "Local Environment"}
          </Text>
        )}
        <Box maw={1440} mx="auto">
          <Outlet />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
