import { useEffect, useState } from "react";
import { ActionIcon, Badge, Button, Code, CopyButton, Group, Menu, Modal, Paper, ScrollArea, Select, SimpleGrid, Stack, Switch, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy, IconDots, IconKey, IconPencil, IconPlus, IconRefresh } from "@tabler/icons-react";
import { api } from "../lib/api";
import type { AppUser } from "../lib/types";
import { dateFmt } from "../lib/format";
import { useApp } from "../core/app-context";
import { Page } from "../core/Page";

/** A readable temporary password, e.g. "Maple-Quartz-4821". The user replaces it at first sign-in. */
function tempPassword() {
  const w = ["Amber", "Basil", "Cedar", "Delta", "Ember", "Flint", "Grove", "Harbor", "Indigo", "Jasper", "Lumen", "Maple", "Nectar", "Onyx", "Quartz", "River", "Saffron", "Tundra"];
  const r = crypto.getRandomValues(new Uint32Array(3));
  return `${w[r[0] % w.length]}-${w[r[1] % w.length]}-${(r[2] % 9000) + 1000}`;
}

export function UsersPage() {
  const { user: me, salesmen, toast } = useApp();
  const [rows, setRows] = useState<AppUser[] | null>(null);
  const [edit, setEdit] = useState<AppUser | "new" | null>(null);
  const [shown, setShown] = useState<{ username: string; password: string } | null>(null);

  const load = () => api.get<AppUser[]>("/users").then(setRows, (e) => toast(e.message, true));
  useEffect(() => {
    load();
  }, []);

  async function reset(u: AppUser) {
    const password = tempPassword();
    try {
      await api.post(`/users/${u.id}/password`, { password });
      setShown({ username: u.username, password });
      load();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  const repName = (id: number | null) => salesmen.find((s) => s.id === id)?.name;

  return (
    <Page crumbs={[{ label: "Dashboard", to: "/" }]} title="Users" actions={<Button leftSection={<IconPlus size={16} />} onClick={() => setEdit("new")}>New User</Button>}>
      <Paper p={0}>
        <ScrollArea>
          <Table highlightOnHover miw={760} verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Username</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Sales Rep</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows?.map((u) => (
                <Table.Tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
                  <Table.Td fw={600}>{u.display_name}{u.id === me.id && <Text span c="dimmed" fz="sm" fw={400}> (you)</Text>}</Table.Td>
                  <Table.Td ff="monospace" fz="sm">{u.username}</Table.Td>
                  <Table.Td><Badge variant="light" color={u.role === "admin" ? "maroon" : "gray"}>{u.role === "admin" ? "Admin" : "User"}</Badge></Table.Td>
                  <Table.Td>{repName(u.salesman_id) || <Text span c="dimmed">—</Text>}</Table.Td>
                  <Table.Td>
                    {!u.active ? <Badge variant="light" color="gray">Inactive</Badge>
                      : u.locked_until && Date.parse(u.locked_until.replace(" ", "T") + "Z") > Date.now() ? <Badge variant="light" color="orange">Locked</Badge>
                      : u.must_change_password ? <Badge variant="light" color="yellow">Awaiting first sign-in</Badge>
                      : <Badge variant="light" color="teal">Active</Badge>}
                  </Table.Td>
                  <Table.Td fz="sm">{dateFmt(u.created_at)}</Table.Td>
                  <Table.Td>
                    <Menu position="bottom-end" shadow="md" width={220}>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" aria-label="User actions"><IconDots size={18} /></ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconPencil size={15} />} onClick={() => setEdit(u)}>Edit</Menu.Item>
                        <Menu.Item leftSection={<IconKey size={15} />} onClick={() => reset(u)}>Reset Password</Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      {edit && (
        <UserForm
          u={edit === "new" ? null : edit}
          reps={salesmen.filter((s) => s.active || (edit !== "new" && s.id === edit.salesman_id)).map((s) => ({ value: String(s.id), label: s.name }))}
          onClose={() => setEdit(null)}
          onSaved={(created) => {
            setEdit(null);
            if (created) setShown(created);
            load();
          }}
        />
      )}
      <Modal opened={!!shown} onClose={() => setShown(null)} title={<Text fw={700} ff="heading" fz="lg">Temporary Password</Text>}>
        {shown && (
          <Stack gap="md">
            <Text fz="sm">Give these to <b>{shown.username}</b>. They set their own password at first sign-in. This password is not shown again.</Text>
            <Group gap="xs" wrap="nowrap">
              <Code fz="lg" p="sm" style={{ flex: 1 }}>{shown.password}</Code>
              <CopyButton value={`Username: ${shown.username}\nTemporary password: ${shown.password}`}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? "Copied" : "Copy username and password"}>
                    <ActionIcon size={42} variant="default" onClick={copy} aria-label="Copy">{copied ? <IconCheck size={18} /> : <IconCopy size={18} />}</ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
            <Group justify="flex-end"><Button onClick={() => setShown(null)}>Done</Button></Group>
          </Stack>
        )}
      </Modal>
    </Page>
  );
}

function UserForm(props: { u: AppUser | null; reps: { value: string; label: string }[]; onClose: () => void; onSaved: (created?: { username: string; password: string }) => void }) {
  const { toast } = useApp();
  const [name, setName] = useState(props.u?.display_name || "");
  const [username, setUsername] = useState(props.u?.username || "");
  const [role, setRole] = useState<string>(props.u?.role || "user");
  const [rep, setRep] = useState<string | null>(props.u?.salesman_id ? String(props.u.salesman_id) : null);
  const [active, setActive] = useState(props.u ? !!props.u.active : true);
  const [password, setPassword] = useState(tempPassword);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const data = { display_name: name, role, salesman_id: rep ? Number(rep) : null, active };
      if (props.u) {
        await api.put(`/users/${props.u.id}`, data);
        toast("User saved");
        props.onSaved();
      } else {
        await api.post("/users", { ...data, username, password });
        toast("User added");
        props.onSaved({ username: username.trim().toLowerCase(), password });
      }
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal opened onClose={props.onClose} size="lg" title={<Text fw={700} ff="heading" fz="lg">{props.u ? "Edit User" : "New User"}</Text>}>
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput label="Full Name" required data-autofocus value={name} onChange={(e) => setName(e.currentTarget.value)} />
          <TextInput label="Username" required disabled={!!props.u} autoCapitalize="none" value={username} onChange={(e) => setUsername(e.currentTarget.value)} />
          <Select label="Role" value={role} onChange={(v) => setRole(v || "user")} allowDeselect={false}
            data={[{ value: "user", label: "User: own quotations only" }, { value: "admin", label: "Admin: all quotations and settings" }]} />
          <Select label="Sales Rep" clearable value={rep} onChange={setRep} data={props.reps} />
        </SimpleGrid>
        {!props.u && (
          <TextInput
            label="Temporary Password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            rightSection={<Tooltip label="New password"><ActionIcon variant="subtle" color="gray" onClick={() => setPassword(tempPassword())} aria-label="New password"><IconRefresh size={16} /></ActionIcon></Tooltip>}
          />
        )}
        {props.u && <Switch label="Active" checked={active} onChange={(e) => setActive(e.currentTarget.checked)} />}
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={props.onClose}>Cancel</Button>
          <Button onClick={save} loading={busy} disabled={!name.trim() || (!props.u && !username.trim())}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
