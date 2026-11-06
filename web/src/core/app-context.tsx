import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Button, Center, Loader, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconX } from "@tabler/icons-react";
import { api } from "../lib/api";
import type { Rep, SessionUser, Settings } from "../lib/types";
import { ChangePassword, SignIn } from "./SignIn";

interface AppState {
  user: SessionUser;
  isAdmin: boolean;
  setUser: (u: SessionUser) => void;
  signOut: () => Promise<void>;
  settings: Settings | null;
  /** Users, as Sales Reps (active ones are offered on new quotations). */
  reps: Rep[];
  env: string;
  reload: () => Promise<void>;
  toast: (msg: string, err?: boolean) => void;
}

const Ctx = createContext<AppState>(null as unknown as AppState);
export const useApp = () => useContext(Ctx);

export const toast = (message: string, err = false) =>
  notifications.show({
    message,
    color: err ? "red" : "teal",
    icon: err ? <IconX size={18} /> : <IconCheck size={18} />,
    autoClose: err ? 6000 : 2500,
    withBorder: true,
  });

export function AppProvider({ children }: { children: ReactNode }) {
  // undefined = still checking, null = signed out
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [reps, setReps] = useState<Rep[]>([]);
  const [env, setEnv] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [s, sm, h] = await Promise.all([
        api.get<Settings>("/settings"),
        api.get<Rep[]>("/reps"),
        api.get<{ env: string }>("/health"),
      ]);
      setSettings(s);
      setReps(sm);
      setEnv(h.env);
      setLoadErr(null);
    } catch (e) {
      setLoadErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    api.get<SessionUser>("/auth/me").then(setUser, () => setUser(null));
    const out = () => setUser(null);
    window.addEventListener("mogul:signed-out", out);
    return () => window.removeEventListener("mogul:signed-out", out);
  }, []);

  const ready = !!user && !user.mustChange;
  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  const signOut = useCallback(async () => {
    await api.post("/auth/logout").catch(() => {});
    setSettings(null);
    setUser(null);
  }, []);

  if (user === undefined) return <Center h="100vh"><Loader /></Center>;
  if (user === null) return <SignIn onSignedIn={setUser} />;
  if (user.mustChange) return <ChangePassword forced onDone={setUser} onSignOut={signOut} />;

  if (loadErr)
    return (
      <Center h="100vh">
        <Stack align="center">
          <Title order={3}>Can't reach the server</Title>
          <Text c="dimmed">{loadErr}</Text>
          <Button onClick={reload}>Try again</Button>
        </Stack>
      </Center>
    );
  if (!settings) return <Center h="100vh"><Loader /></Center>;

  return <Ctx.Provider value={{ user, isAdmin: user.role === "admin", setUser, signOut, settings, reps, env, reload, toast }}>{children}</Ctx.Provider>;
}
