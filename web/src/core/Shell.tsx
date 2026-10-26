import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { modules } from "../modules";
import { useApp } from "./app-context";
import { useEffect } from "react";

export function Shell() {
  const { env } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const nav = (to: string, label: string, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => "nav" + (isActive ? " active" : "")}>
      {label}
    </NavLink>
  );
  return (
    <div className="app">
      <aside className={"side" + (open ? " open" : "")}>
        <NavLink to="/" className="brand">
          <b>ME</b>
          <span>Mogul Workspace</span>
        </NavLink>
        {modules.map((m) =>
          m.newAction ? (
            <NavLink key={m.id} to={m.newAction.path} className="btn p" style={{ justifyContent: "center", margin: "0 4px 10px" }}>
              + {m.newAction.label}
            </NavLink>
          ) : null,
        )}
        <nav>
          {nav("/", "Home", true)}
          {modules.flatMap((m) => m.nav.map((n) => <span key={n.path}>{nav(n.path, n.label)}</span>))}
          <div className="cap">Core</div>
          {nav("/customers", "Customers")}
          {nav("/settings", "Settings")}
        </nav>
        <div className="grow" />
        <div className="envtag">{env === "production" ? "Live" : env === "staging" ? "Staging" : env || ""}</div>
      </aside>
      <div className="main">
        <div className="mobile-top no-print">
          <button className="btn sm" onClick={() => setOpen((o) => !o)} aria-label="Menu">☰</button>
          <b>ME</b> Mogul Workspace
        </div>
        {env && env !== "production" && (
          <div className="envbar no-print">{env.toUpperCase()} · test data only · not the live system</div>
        )}
        <Outlet />
      </div>
      {open && <div className="modal-bg" style={{ zIndex: 40 }} onClick={() => setOpen(false)} />}
    </div>
  );
}
