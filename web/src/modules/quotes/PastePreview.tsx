import { useEffect, useMemo, useState } from "react";
import { analysePaste, type PasteInput, type ParsedItem, type Role } from "../../../../shared/paste-engine";
import { Modal } from "../../core/Modal";
import { qtyFmt } from "../../lib/format";

const ROLES: [Role, string][] = [
  ["sr", "Sr No"],
  ["desc", "Description"],
  ["append", "Add to description"],
  ["qty", "Qty"],
  ["unit", "Unit"],
  ["rate", "Rate"],
  ["ignore", "Ignore"],
];

export type PasteMode = "append" | "replace" | "insert";

export function PastePreview(props: {
  input: PasteInput;
  hasLines: boolean;
  canInsert: boolean;
  enquiryEmpty: boolean;
  onCancel: () => void;
  onConfirm: (items: ParsedItem[], mode: PasteMode, enquiry: string | null) => void;
}) {
  const [overrides, setOverrides] = useState<Record<number, Role>>({});
  const res = useMemo(() => analysePaste(props.input, overrides), [props.input, overrides]);
  const [mode, setMode] = useState<PasteMode>("append");
  const [useEnq, setUseEnq] = useState(true);
  const count = res.items.filter((i) => !i.heading).length;

  const confirm = () => props.onConfirm(res.items, props.hasLines ? mode : "append", useEnq && props.enquiryEmpty ? res.enquiry : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !(e.target instanceof HTMLSelectElement) && count > 0) {
        e.preventDefault();
        confirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  let sr = 0;
  return (
    <Modal
      wide
      title="Paste preview"
      onClose={props.onCancel}
      footer={
        <>
          {props.hasLines && (
            <div className="seg" style={{ marginRight: "auto" }}>
              <button className={mode === "append" ? "on" : ""} onClick={() => setMode("append")}>Add after existing lines</button>
              {props.canInsert && <button className={mode === "insert" ? "on" : ""} onClick={() => setMode("insert")}>Insert at cursor</button>}
              <button className={mode === "replace" ? "on" : ""} onClick={() => setMode("replace")}>Replace all lines</button>
            </div>
          )}
          <button className="btn" onClick={props.onCancel}>Cancel</button>
          <button className="btn p" disabled={!count} onClick={confirm}>
            Add {count} line{count === 1 ? "" : "s"} <span className="kbd" style={{ color: "inherit", background: "transparent", borderColor: "rgba(255,255,255,.5)" }}>Enter</span>
          </button>
        </>
      }
    >
      <div className="pp">
        <div className="muted">
          Read as: <b>{res.source}</b> · {count} line{count === 1 ? "" : "s"}
          {res.items.some((i) => i.heading) ? ` · ${res.items.filter((i) => i.heading).length} section heading(s)` : ""}
        </div>
        {res.enquiry && props.enquiryEmpty && (
          <label className="enq check">
            <input type="checkbox" checked={useEnq} onChange={(e) => setUseEnq(e.target.checked)} />
            Enquiry reference found: <b>{res.enquiry}</b> <span className="muted">· fill the Enquiry ref field</span>
          </label>
        )}
        {res.cols.length > 0 && (
          <div>
            <div className="cap" style={{ marginBottom: 6 }}>Column mapping · change any</div>
            <div className="pp-map">
              {res.cols.map((c, i) => (
                <label key={i} className={c.role === "ignore" ? "off" : ""} title={c.label}>
                  <span>{c.label}</span>
                  <select value={c.role} onChange={(e) => setOverrides({ ...overrides, [i]: e.target.value as Role })}>
                    {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}
        {res.notes.length > 0 && <ul className="pp-notes">{res.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        <div className="pp-table">
          <table className="tbl">
            <thead>
              <tr><th>Sr</th><th>Description</th><th className="r">Qty</th><th>Unit</th><th className="r">Rate</th></tr>
            </thead>
            <tbody>
              {res.items.map((it, i) =>
                it.heading ? (
                  <tr key={i} className="hd"><td /><td colSpan={4}>{it.desc}</td></tr>
                ) : (
                  <tr key={i}>
                    <td className="num">{++sr}</td>
                    <td>{it.desc}</td>
                    <td className={"r num" + (it.flag ? " flag" : "")} title={it.flag ? "No quantity found — set to 1" : undefined}>{qtyFmt(it.qty)}</td>
                    <td>{it.unit}</td>
                    <td className="r num">{it.rate ?? <span className="muted">—</span>}</td>
                  </tr>
                ),
              )}
              {!res.items.length && <tr><td colSpan={5} className="empty">Nothing recognisable in the pasted content.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          Rates are typed in after adding. Underlined quantities weren't found in the paste and were set to 1.
        </div>
      </div>
    </Modal>
  );
}
