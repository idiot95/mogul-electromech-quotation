import { modules } from "../modules";

export function HomePage() {
  const widgets = modules.flatMap((m) => (m.widgets || []).map((W, i) => <W key={m.id + i} />));
  return <div className="page">{widgets}</div>;
}
