import { useEffect, useState } from "react";
import { ActionIcon, Badge, Button, Code, CopyButton, Group, Menu, Modal, Paper, ScrollArea, Select, SimpleGrid, Stack, Switch, Table, Text, TextInput, Textarea, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy, IconDots, IconKey, IconPencil, IconPlus, IconRefresh } from "@tabler/icons-react";
import { api } from "../lib/api";
import type { AppUser } from "../lib/types";
import { dateFmt } from "../lib/format";
import { useApp } from "../core/app-context";
import { Page } from "../core/Page";
import { DEFAULT_EMAIL_TEMPLATE, TEMPLATE_FIELDS } from "../lib/email-template";

/** A readable password suggestion, e.g. "Maple-Quartz-4821". */
function suggestPassword() {
  const w = ["Amber", "Basil", "Cedar", "Delta", "Ember", "Flint", "Grove", "Harbor", "Indigo", "Jasper", "Lumen", "Maple", "Nectar", "Onyx", "Quartz", "River", "Saffron", "Tundra"];
  const r = crypto.getRandomValues(new Uint32Array(3));
  return `${w[r[0] % w.length]}-${w[r[1] % w.length]}-${(r[2] % 9000) + 1000}`;
}

/** Password typed (or generated) by the admin; shown in plain text so it can be passed on. */
function PasswordField(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; description?: string; required?: boolean }) {
  return (
    <TextInput
      label={props.label}
      description={props.description}
      placeholder={props.placeholder}
      required={props.required}
      autoComplete="off"
      value={props.value}
      onChange={(e) => props.onChange(e.currentTarget.value)}
      rightSection={
        <Tooltip label="Suggest a password">
          <ActionIcon variant="subtle" color="gray" onClick={() => props.onChange(suggestPassword())} aria-label="Suggest a password"><IconRefresh size={16} /></ActionIcon>
        </Tooltip>
      }
    />
  );
}

export function UsersPage() {
  const { user: me, reload, toast } = useApp();
  const [rows, setRows] = useState<AppUser[] | null>(null);
  const [edit, setEdit] = useState<AppUser | "new" | null>(null);
  const [shown, setShown] = useState<{ username: string; password: string } | null>(null);
  const [pwFor, setPwFor] = useState<AppUser | null>(null);

  // users are the Sales Reps, so the Sales Rep lists elsewhere are refreshed too
  const load = () => Promise.all([api.get<AppUser[]>("/users").then(setRows), reload()]).catch((e) => toast(e.message, true));
  useEffect(() => {
    load();
  }, []);

  return (
    <Page crumbs={[{ label: "Dashboard", to: "/" }]} title="Users" actions={<Button leftSection={<IconPlus size={16} />} onClick={() => setEdit("new")}>New User</Button>}>
      <Paper p={0}>
        <ScrollArea>
          <Table highlightOnHover miw={760} verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Full Name</Table.Th>
                <Table.Th>Username</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Phone</Table.Th>
                <Table.Th>Role</Table.Th>
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
                  <Table.Td fz="sm">{u.email}</Table.Td>
                  <Table.Td fz="sm">{u.phone}</Table.Td>
                  <Table.Td><Badge variant="light" color={u.role === "admin" ? "maroon" : "gray"}>{u.role === "admin" ? "Admin" : "User"}</Badge></Table.Td>
                  <Table.Td>
                    {!u.has_password ? <Badge variant="light" color="red">No password</Badge>
                      : !u.active ? <Badge variant="light" color="gray">Inactive</Badge>
                      : u.locked_until && Date.parse(u.locked_until.replace(" ", "T") + "Z") > Date.now() ? <Badge variant="light" color="orange">Locked</Badge>
                      : u.must_change_password ? <Badge variant="light" color="yellow">Must change password</Badge>
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
                        <Menu.Item leftSection={<IconKey size={15} />} onClick={() => setPwFor(u)}>Set Password</Menu.Item>
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
          onClose={() => setEdit(null)}
          onSaved={(signIn) => {
            setEdit(null);
            if (signIn) setShown(signIn);
            load();
          }}
        />
      )}
      {pwFor && (
        <SetPassword
          u={pwFor}
          onClose={() => setPwFor(null)}
          onSaved={(signIn) => {
            setPwFor(null);
            setShown(signIn);
            load();
          }}
        />
      )}
      <Modal opened={!!shown} onClose={() => setShown(null)} title={<Text fw={700} ff="heading" fz="lg">Sign-in Details</Text>}>
        {shown && (
          <Stack gap="md">
            <Text fz="sm">Username <b>{shown.username}</b> can now sign in with this password. It is not shown again.</Text>
            <Group gap="xs" wrap="nowrap">
              <Code fz="lg" p="sm" style={{ flex: 1 }}>{shown.password}</Code>
              <CopyButton value={`Username: ${shown.username}\nPassword: ${shown.password}`}>
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

function SetPassword(props: { u: AppUser; onClose: () => void; onSaved: (signIn: { username: string; password: string }) => void }) {
  const { toast } = useApp();
  const [password, setPassword] = useState("");
  const [mustChange, setMustChange] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      // setting a password also lets a switched-off user sign in
      if (!props.u.active) await api.put(`/users/${props.u.id}`, { ...props.u, active: true });
      await api.post(`/users/${props.u.id}/password`, { password, must_change: mustChange });
      toast("Password set");
      props.onSaved({ username: props.u.username, password });
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal opened onClose={props.onClose} title={<Text fw={700} ff="heading" fz="lg">Set Password · {props.u.display_name}</Text>}>
      <Stack gap="md">
        <PasswordField label="New Password" description="At least 6 characters" required value={password} onChange={setPassword} />
        <Switch label="Ask them to choose their own password at first sign-in" checked={mustChange} onChange={(e) => setMustChange(e.currentTarget.checked)} />
        {!props.u.active && <Text fz="sm" c="dimmed">This user is switched off; setting a password switches them on.</Text>}
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>Cancel</Button>
          <Button onClick={save} loading={busy} disabled={password.length < 6}>Set Password</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function UserForm(props: { u: AppUser | null; onClose: () => void; onSaved: (signIn?: { username: string; password: string }) => void }) {
  const { toast } = useApp();
  const [name, setName] = useState(props.u?.display_name || "");
  const [username, setUsername] = useState(props.u?.username || "");
  const [role, setRole] = useState<string>(props.u?.role || "user");
  const [email, setEmail] = useState(props.u?.email || "");
  const [phone, setPhone] = useState(props.u?.phone || "");
  const [template, setTemplate] = useState(props.u?.email_template || DEFAULT_EMAIL_TEMPLATE);
  const [active, setActive] = useState(props.u ? !!props.u.active : true);
  const [password, setPassword] = useState("");
  const [mustChange, setMustChange] = useState(false);
  const needsPassword = !props.u || !props.u.has_password;
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const data = { display_name: name, email, phone, email_template: template === DEFAULT_EMAIL_TEMPLATE ? null : template, role, active };
      const pw = password ? { password, must_change: mustChange } : {};
      if (props.u) await api.put(`/users/${props.u.id}`, { ...data, ...pw });
      else await api.post("/users", { ...data, ...pw, username });
      toast(props.u ? "User saved" : "User added");
      props.onSaved(password ? { username: (props.u?.username || username).trim().toLowerCase(), password } : undefined);
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
          <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          <TextInput label="Phone" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} />
          <Select label="Role" value={role} onChange={(v) => setRole(v || "user")} allowDeselect={false}
            data={[{ value: "user", label: "User: own quotations only" }, { value: "admin", label: "Admin: all quotations and settings" }]} />
        </SimpleGrid>
        <Textarea label="Email Template" description={`Fields: ${TEMPLATE_FIELDS}`} autosize minRows={6} maxRows={12} value={template} onChange={(e) => setTemplate(e.currentTarget.value)} />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <PasswordField
            label={props.u ? "New Password" : "Password"}
            required={needsPassword}
            description={needsPassword ? "At least 6 characters" : undefined}
            placeholder={needsPassword ? undefined : "Leave blank to keep the current one"}
            value={password}
            onChange={(v) => {
              setPassword(v);
              if (v && props.u && !props.u.has_password) setActive(true); // a first password is for signing in
            }}
          />
          <Stack gap={6} justify="flex-end" pb={6}>
            {props.u && <Switch label="Active (can sign in)" checked={active} onChange={(e) => setActive(e.currentTarget.checked)} />}
            {password && <Switch label="Must change at first sign-in" checked={mustChange} onChange={(e) => setMustChange(e.currentTarget.checked)} />}
          </Stack>
        </SimpleGrid>
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={props.onClose}>Cancel</Button>
          <Button onClick={save} loading={busy} disabled={!name.trim() || (!props.u && !username.trim()) || (!props.u && password.length < 6)}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
