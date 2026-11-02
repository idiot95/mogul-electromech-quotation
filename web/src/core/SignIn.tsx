import { useState } from "react";
import { Alert, Box, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { api } from "../lib/api";
import type { SessionUser } from "../lib/types";

function Frame(props: { title: string; children: React.ReactNode }) {
  return (
    <Center mih="100vh" bg="#f4f4f2" p="md">
      <Paper p={36} w={400} maw="100%" radius="lg" shadow="sm">
        <Box mb={28} lh={0} className="brand">
          <img src="/logo.jpg" alt="Mogul Electromech LLC" style={{ height: 60, width: "auto", maxWidth: "100%" }} />
        </Box>
        <Title order={3} mb="lg">{props.title}</Title>
        {props.children}
      </Paper>
    </Center>
  );
}

export function SignIn(props: { onSignedIn: (u: SessionUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      props.onSignedIn(await api.post<SessionUser>("/auth/login", { username, password }));
    } catch (err) {
      setError((err as Error).message);
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame title="Sign In">
      <form onSubmit={submit}>
        <Stack gap="md">
          {error && <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />} p="xs">{error}</Alert>}
          <TextInput label="Username" autoComplete="username" autoCapitalize="none" required data-autofocus autoFocus value={username} onChange={(e) => setUsername(e.currentTarget.value)} />
          <PasswordInput label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
          <Button type="submit" size="md" loading={busy} mt="xs">Sign In</Button>
        </Stack>
      </form>
    </Frame>
  );
}

/** Change the signed-in user's password. `forced`: shown full-page after an admin set a temporary password. */
export function ChangePassword(props: { forced?: boolean; onDone: (u: SessionUser) => void; onCancel?: () => void; onSignOut?: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) return setError("The new passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      props.onDone(await api.post<SessionUser>("/auth/password", { current, next }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <form onSubmit={submit}>
      <Stack gap="md">
        {props.forced && <Text fz="sm" c="dimmed">Set your own password to continue.</Text>}
        {error && <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />} p="xs">{error}</Alert>}
        <PasswordInput label={props.forced ? "Temporary Password" : "Current Password"} autoComplete="current-password" required autoFocus value={current} onChange={(e) => setCurrent(e.currentTarget.value)} />
        <PasswordInput label="New Password" description="At least 8 characters" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.currentTarget.value)} />
        <PasswordInput label="Confirm New Password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.currentTarget.value)} />
        <Button type="submit" size="md" loading={busy} mt="xs">Save Password</Button>
        {props.onCancel && <Button variant="subtle" color="gray" onClick={props.onCancel}>Cancel</Button>}
        {props.onSignOut && <Button variant="subtle" color="gray" onClick={props.onSignOut}>Sign Out</Button>}
      </Stack>
    </form>
  );
  return props.forced ? <Frame title="Set Your Password">{form}</Frame> : form;
}
