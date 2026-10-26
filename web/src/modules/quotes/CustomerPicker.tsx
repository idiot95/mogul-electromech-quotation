import { useEffect, useMemo, useRef, useState } from "react";
import type { Customer } from "../../lib/types";

/** Type-ahead customer dropdown with a "+ New customer" entry at the bottom. */
export function CustomerPicker(props: {
  customers: Customer[];
  value: string;
  selectedId: number | null;
  readOnly?: boolean;
  onPick: (c: Customer) => void;
  onNew: (name: string) => void;
  onType: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const q = props.value.trim().toLowerCase();
  const matches = useMemo(() => {
    const act = props.customers.filter((c) => c.active);
    if (!q || props.selectedId) return act.slice(0, 50);
    const starts = act.filter((c) => c.name.toLowerCase().startsWith(q));
    const rest = act.filter((c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q));
    return [...starts, ...rest].slice(0, 50);
  }, [props.customers, q, props.selectedId]);
  const total = matches.length + 1;

  useEffect(() => {
    const close = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function choose(i: number) {
    setOpen(false);
    if (i < matches.length) props.onPick(matches[i]);
    else props.onNew(props.value.trim());
  }

  return (
    <div className="combo" ref={boxRef}>
      <input
        value={props.value}
        readOnly={props.readOnly}
        placeholder="Type to search customers…"
        onFocus={() => !props.readOnly && setOpen(true)}
        onChange={(e) => {
          props.onType(e.target.value);
          setOpen(true);
          setHl(0);
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
            setOpen(true);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHl((h) => (h + 1) % total);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHl((h) => (h - 1 + total) % total);
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            choose(hl);
          } else if (e.key === "Escape") setOpen(false);
        }}
        aria-autocomplete="list"
      />
      {open && !props.readOnly && (
        <div className="combo-list" role="listbox">
          {matches.map((c, i) => (
            <div key={c.id} className={i === hl ? "hl" : ""} onMouseEnter={() => setHl(i)} onMouseDown={(e) => { e.preventDefault(); choose(i); }}>
              {c.name}
            </div>
          ))}
          <div className={"new" + (hl === matches.length ? " hl" : "")} onMouseEnter={() => setHl(matches.length)} onMouseDown={(e) => { e.preventDefault(); choose(matches.length); }}>
            + New customer{props.value.trim() && !props.selectedId ? ` “${props.value.trim()}”` : ""}
          </div>
        </div>
      )}
    </div>
  );
}
