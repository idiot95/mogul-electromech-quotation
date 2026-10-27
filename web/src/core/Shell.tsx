import { Suspense, useEffect, useState } from "react";
import { NavLink as RouterLink, Outlet, useLocation } from "react-router";
import { ActionIcon, AppShell, Box, Burger, Button, Center, Group, Loader, ScrollArea, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconHome, IconFileText, IconUsers, IconSettings, IconPlus, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { modules } from "../modules";
import { useApp } from "./app-context";

const ICONS: Record<string, typeof IconHome> = { "/quotes": IconFileText };
const COLLAPSED_KEY = "mogul.sidebarCollapsed";

/** The company logo; collapsed, only the ME mark (the left part of the same image) shows. */
function Brand({ height, markOnly }: { height: number; markOnly?: boolean }) {
  return (
    <Box component={RouterLink} to="/" display="block" lh={0} aria-label="Mogul Electromech · Dashboard" className="brand">
      <img
        src="/logo.jpg"
        alt="Mogul Electromech LLC"
        style={markOnly ? { height, width: height * 0.78, objectFit: "cover", objectPosition: "3% 50%" } : { height, width: "auto", maxWidth: "100%" }}
      />
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
  const [collapsedPref, setCollapsedPref] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const collapsed = desktop && collapsedPref;
  const setCollapsed = (v: boolean) => {
    setCollapsedPref(v);
    try {
      localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  };

  const link = (to: string, label: string, Icon: typeof IconHome, end = false) => {
    const active = end ? loc.pathname === to : loc.pathname === to || loc.pathname.startsWith(to + "/");
    return (
      <Tooltip key={to} label={label} position="right" disabled={!collapsed} withArrow>
        <UnstyledButton component={RouterLink} to={to} className="side-link" data-active={active || undefined} data-collapsed={collapsed || undefined} aria-label={label}>
          <Icon size={19} stroke={1.7} />
          {!collapsed && <span>{label}</span>}
        </UnstyledButton>
      </Tooltip>
    );
  };

  return (
    <AppShell
      header={{ height: 56, collapsed: desktop }}
      navbar={{ width: collapsed ? 76 : 256, breakpoint: "md", collapsed: { mobile: !opened } }}
      padding="lg"
    >
      <AppShell.Header className="no-print side-header">
        <Group h="100%" px="md" gap="sm">
          <Burger opened={opened} onClick={toggle} size="sm" aria-label="Menu" />
          <Brand height={36} />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar className="no-print side" p={collapsed ? "sm" : "md"}>
        <Box visibleFrom="md" pt={collapsed ? 8 : 10} pb={collapsed ? 18 : 22} px={collapsed ? 0 : 4} style={{ display: "flex", justifyContent: collapsed ? "center" : "flex-start" }}>
          <Brand height={collapsed ? 44 : 64} markOnly={collapsed} />
        </Box>

        {modules.map((m) =>
          m.newAction ? (
            collapsed ? (
              <Tooltip key={m.id} label={m.newAction.label} position="right" withArrow>
                <ActionIcon component={RouterLink} to={m.newAction.path} variant="outline" size={44} radius="md" mx="auto" mb="lg" aria-label={m.newAction.label}>
                  <IconPlus size={20} />
                </ActionIcon>
              </Tooltip>
            ) : (
              <Button key={m.id} component={RouterLink} to={m.newAction.path} variant="outline" leftSection={<IconPlus size={18} />} size="md" mb="lg" fullWidth radius="md" bg="white">
                {m.newAction.label}
              </Button>
            )
          ) : null,
        )}

        <AppShell.Section grow component={ScrollArea}>
          <Stack gap={4}>
            {link("/", "Dashboard", IconHome, true)}
            {modules.flatMap((m) => m.nav.map((n) => link(n.path, n.label, ICONS[n.path] || IconFileText)))}
            {collapsed ? <Box h={1} bg="gray.3" my="sm" mx="xs" /> : <Text className="side-group">Administration</Text>}
            {link("/customers", "Customers", IconUsers)}
            {link("/settings", "Settings", IconSettings)}
          </Stack>
        </AppShell.Section>

        <Group justify={collapsed ? "center" : "space-between"} pt="sm" mt="sm" className="side-foot" wrap="nowrap">
          {env && !collapsed && (
            <Group gap={6} wrap="nowrap">
              <Box w={8} h={8} style={{ borderRadius: 4 }} bg={env === "production" ? "teal.6" : "yellow.6"} />
              <Text fz="xs" c="dimmed" fw={500}>{env === "production" ? "Production" : env === "staging" ? "Staging" : "Local"}</Text>
            </Group>
          )}
          <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} position="right" withArrow>
            <ActionIcon variant="subtle" color="gray" size="lg" visibleFrom="md" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {collapsed ? <IconLayoutSidebarLeftExpand size={20} /> : <IconLayoutSidebarLeftCollapse size={20} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </AppShell.Navbar>

      <AppShell.Main bg="gray.0">
        {staging && (
          <Text ta="center" fz={12} fw={600} bg="yellow.4" c="dark.8" py={4} mx="calc(var(--mantine-spacing-lg) * -1)" mt="calc(var(--mantine-spacing-lg) * -1)" mb="md" className="no-print">
            {env === "staging" ? "Staging Environment" : "Local Environment"}
          </Text>
        )}
        <Box maw={1440} mx="auto">
          <Suspense fallback={<Center py={80}><Loader /></Center>}>
            <Outlet />
          </Suspense>
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
