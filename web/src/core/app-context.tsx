import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Button, Center, Loader, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconX } from "@tabler/icons-react";
import { api } from "../lib/api";
import type { Salesman, Settings } from "../lib/types";

interface AppState {
  settings: Settings | null;
  salesmen: Salesman[];
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
  const [settings, setSettings] = useState<Settings | null>(null);
  const [salesmen, setSalesmen] = useState<Salesman[]>([]);
  const [env, setEnv] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [s, sm, h] = await Promise.all([
        api.get<Settings>("/settings"),
        api.get<Salesman[]>("/salesmen?all=1"),
        api.get<{ env: string }>("/health"),
      ]);
      setSettings(s);
      setSalesmen(sm);
      setEnv(h.env);
      setLoadErr(null);
    } catch (e) {
      setLoadErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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

  return <Ctx.Provider value={{ settings, salesmen, env, reload, toast }}>{children}</Ctx.Provider>;
}
