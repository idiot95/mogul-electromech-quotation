import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [salesmen, setSalesmen] = useState<Salesman[]>([]);
  const [env, setEnv] = useState("");
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
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

  const toast = useCallback((text: string, err = false) => {
    setMsg({ text, err });
    window.setTimeout(() => setMsg((m) => (m && m.text === text ? null : m)), err ? 6000 : 2600);
  }, []);

  if (loadErr)
    return (
      <div className="empty">
        <h2>Can't reach the server</h2>
        <p>{loadErr}</p>
        <button className="btn" onClick={reload}>Try again</button>
      </div>
    );

  return (
    <Ctx.Provider value={{ settings, salesmen, env, reload, toast }}>
      {children}
      {msg && <div className={"toast" + (msg.err ? " err" : "")} role="status">{msg.text}</div>}
    </Ctx.Provider>
  );
}
