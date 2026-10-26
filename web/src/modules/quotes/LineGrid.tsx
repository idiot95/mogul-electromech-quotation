import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { ActionIcon, Button, Group, Kbd, Menu, Text } from "@mantine/core";
import { IconArrowBackUp, IconArrowDown, IconArrowUp, IconCopy, IconDotsVertical, IconGripVertical, IconHeading, IconPlus, IconRowInsertBottom, IconRowInsertTop, IconTrash } from "@tabler/icons-react";
import { money } from "../../lib/format";
import { blankLine, headingLine, lineAmount, newKey, parseNum, type EditLine } from "./lines";
import { parseNumberColumn, type PasteInput } from "../../../../shared/paste-engine";

type Col = "description" | "qty" | "unit" | "rate";
const COLS: Col[] = ["description", "qty", "unit", "rate"];

export interface GridApi {
  focusCell: (row: number, col: Col) => void;
}

export function LineGrid(props: {
  lines: EditLine[];
  readOnly?: boolean;
  defaultUnit: string;
  currency: string;
  /** structural = true for changes that should be one undo step (paste, insert, delete, reorder, fill) */
  onChange: (lines: EditLine[], structural: boolean) => void;
  onBulkPaste: (input: PasteInput, atRow: number | null) => void;
  onFileDrop: (file: File) => void;
  onUndo: () => void;
  canUndo: boolean;
  gridRef?: React.MutableRefObject<GridApi | null>;
}) {
  const { lines, readOnly } = props;
  const tableRef = useRef<HTMLTableElement>(null);
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null);
  const [dropping, setDropping] = useState(false);
  const pendingFocus = useRef<{ row: number; col: Col } | null>(null);

  const focusCell = (row: number, col: Col) => {
    const el = tableRef.current?.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
    if (el) {
      el.focus();
      if (el instanceof HTMLInputElement) el.select();
    } else pendingFocus.current = { row, col };
  };
  if (props.gridRef) props.gridRef.current = { focusCell };

  useEffect(() => {
    if (pendingFocus.current) {
      const p = pendingFocus.current;
      pendingFocus.current = null;
      focusCell(p.row, p.col);
    }
  });

  const update = (i: number, patch: Partial<EditLine>) => {
    const next = lines.slice();
    next[i] = { ...next[i], ...patch };
    props.onChange(next, false);
  };
  const structural = (next: EditLine[]) => props.onChange(next, true);

  const insertAt = (i: number, l: EditLine = blankLine(props.defaultUnit)) => {
    const next = lines.slice();
    next.splice(i, 0, l);
    structural(next);
    pendingFocus.current = { row: i, col: "description" };
  };
  const removeAt = (i: number) => {
    const next = lines.filter((_, k) => k !== i);
    structural(next.length ? next : [blankLine(props.defaultUnit)]);
    pendingFocus.current = { row: Math.min(i, next.length - 1), col: "description" };
  };
  const move = (from: number, to: number) => {
    if (from === to || from + 1 === to) return;
    const next = lines.slice();
    const [l] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, l);
    structural(next);
  };

  function onKey(e: KeyboardEvent<HTMLElement>, row: number, col: Col) {
    const isText = col === "description";
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Enter" && !(isText && (e.shiftKey || e.altKey))) {
      // Enter moves down the same column, like Excel. Shift/Alt+Enter = new line inside a description.
      e.preventDefault();
      let r = row + 1;
      while (r < lines.length && col !== "description" && lines[r].kind === "heading") r++;
      if (r >= lines.length) {
        if (col === "rate") return;
        insertAt(lines.length);
        pendingFocus.current = { row: lines.length, col };
        return;
      }
      focusCell(r, col);
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && (!isText || mod)) {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      let r = row + d;
      while (r >= 0 && r < lines.length && col !== "description" && lines[r].kind === "heading") r += d;
      if (r >= 0 && r < lines.length) focusCell(r, col);
    } else if (mod && (e.key === "d" || e.key === "D")) {
      // Ctrl+D: fill down from the row above
      e.preventDefault();
      if (row > 0) {
        const next = lines.slice();
        next[row] = { ...next[row], [col]: lines[row - 1][col] };
        structural(next);
      }
    } else if (mod && e.shiftKey && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      removeAt(row);
    } else if (mod && e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      insertAt(row + 1);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLElement>, row: number, col: Col) {
    if (readOnly) return;
    const cd = e.clipboardData;
    const text = cd.getData("text/plain");
    const html = cd.getData("text/html");
    const multi = /\t/.test(text) || /\n./.test(text.replace(/\r/g, "").replace(/\n+$/, ""));
    if (!multi) return; // single value: normal paste into this cell
    if (col === "rate" || col === "qty") {
      // a column of numbers pasted into Rate (or Qty) fills down from here
      const vals = parseNumberColumn(text);
      if (vals) {
        e.preventDefault();
        const next = lines.slice();
        let r = row;
        for (const v of vals) {
          while (r < next.length && next[r].kind === "heading") r++;
          if (r >= next.length) break;
          next[r] = { ...next[r], [col]: v == null ? "" : String(v) };
          r++;
        }
        structural(next);
        return;
      }
    }
    e.preventDefault();
    props.onBulkPaste({ text, html: html && /<table/i.test(html) ? html : null }, row);
  }

  function onDrop(e: DragEvent) {
    setDropping(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      e.preventDefault();
      props.onFileDrop(f);
    }
  }

  let sr = 0;
  return (
    <div
      className={"lg-wrap" + (dropping ? " dropzone" : "")}
      onDragOver={(e) => {
        if (!readOnly && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <table className="lg" ref={tableRef}>
        <thead>
          <tr>
            <th>Sr</th>
            <th>Description of goods</th>
            <th className="r">Qty</th>
            <th>Unit</th>
            <th className="r">Rate ({props.currency})</th>
            <th className="r">Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const heading = l.kind === "heading";
            if (!heading) sr++;
            const amt = lineAmount(l);
            const cls = [heading ? "heading" : "", drag && drag.over === i && drag.from !== i ? "drop-before" : ""].join(" ");
            return (
              <tr
                key={l.key}
                className={cls}
                onDragOver={(e) => {
                  if (drag) {
                    e.preventDefault();
                    if (drag.over !== i) setDrag({ ...drag, over: i });
                  }
                }}
                onDrop={(e) => {
                  if (drag) {
                    e.preventDefault();
                    e.stopPropagation();
                    move(drag.from, i);
                    setDrag(null);
                  }
                }}
              >
                <td
                  className="sr"
                  draggable={!readOnly}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(i));
                    setDrag({ from: i, over: null });
                  }}
                  onDragEnd={() => setDrag(null)}
                  title={readOnly ? undefined : "Drag to reorder"}
                >
                  {!readOnly && <IconGripVertical size={12} className="grip" />}
                  {heading ? "§" : sr}
                </td>
                <td colSpan={heading ? 4 : 1}>
                  <AutoTextarea
                    className="cell"
                    value={l.description}
                    readOnly={readOnly}
                    placeholder={heading ? "Section heading" : i === 0 && lines.length === 1 ? "Paste items here (Ctrl+V) or type a description" : ""}
                    data-row={i}
                    data-col="description"
                    onChange={(v) => update(i, { description: v })}
                    onKeyDown={(e) => onKey(e, i, "description")}
                    onPaste={(e) => onPaste(e, i, "description")}
                  />
                </td>
                {!heading && (
                  <>
                    <td className="qty">
                      <input className="cell n" inputMode="decimal" value={l.qty} readOnly={readOnly} data-row={i} data-col="qty"
                        onChange={(e) => update(i, { qty: e.target.value })} onKeyDown={(e) => onKey(e, i, "qty")} onPaste={(e) => onPaste(e, i, "qty")} />
                    </td>
                    <td className="unit">
                      <input className="cell" value={l.unit} readOnly={readOnly} data-row={i} data-col="unit" list="unit-list"
                        onChange={(e) => update(i, { unit: e.target.value })} onKeyDown={(e) => onKey(e, i, "unit")} onPaste={(e) => onPaste(e, i, "unit")} />
                    </td>
                    <td className="rate">
                      <input
                        className={"cell n" + (!readOnly && l.description.trim() && parseNum(l.rate) == null ? " missing" : "")}
                        inputMode="decimal" value={l.rate} readOnly={readOnly} data-row={i} data-col="rate"
                        placeholder={l.description.trim() ? "enter rate" : ""}
                        onChange={(e) => update(i, { rate: e.target.value })} onKeyDown={(e) => onKey(e, i, "rate")} onPaste={(e) => onPaste(e, i, "rate")}
                      />
                    </td>
                  </>
                )}
                <td className="amt">{heading ? "" : amt == null ? "–" : money(amt)}</td>
                <td className="act">
                  {!readOnly && (
                    <Menu position="bottom-end" withinPortal shadow="md" width={210}>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" className="rowmenu" aria-label="Row actions"><IconDotsVertical size={16} /></ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconRowInsertTop size={15} />} onClick={() => insertAt(i)}>Insert line above</Menu.Item>
                        <Menu.Item leftSection={<IconRowInsertBottom size={15} />} onClick={() => insertAt(i + 1)}>Insert line below</Menu.Item>
                        <Menu.Item leftSection={<IconHeading size={15} />} onClick={() => insertAt(i, headingLine())}>Insert heading above</Menu.Item>
                        <Menu.Item
                          leftSection={<IconHeading size={15} />}
                          onClick={() => {
                            const next = lines.slice();
                            next[i] = l.kind === "heading" ? { ...l, kind: "item", unit: props.defaultUnit } : { ...l, kind: "heading", qty: "", rate: "", unit: "" };
                            structural(next);
                          }}
                        >
                          {heading ? "Change to item line" : "Change to heading"}
                        </Menu.Item>
                        <Menu.Item leftSection={<IconCopy size={15} />} onClick={() => { const next = lines.slice(); next.splice(i + 1, 0, { ...l, key: newKey() }); structural(next); }}>Duplicate</Menu.Item>
                        <Menu.Item leftSection={<IconArrowUp size={15} />} disabled={i === 0} onClick={() => move(i, i - 1)}>Move up</Menu.Item>
                        <Menu.Item leftSection={<IconArrowDown size={15} />} disabled={i === lines.length - 1} onClick={() => move(i, i + 2)}>Move down</Menu.Item>
                        <Menu.Divider />
                        <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={() => removeAt(i)}>Delete line</Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <datalist id="unit-list">
        {["Nos.", "Pcs", "Set", "Pair", "Mtr", "Kg", "Ltr", "Lot", "Roll", "Box", "Coil", "Length", "LS"].map((u) => <option key={u} value={u} />)}
      </datalist>
      {!readOnly && (
        <Group className="lg-foot no-print" gap="xs" px="xs" py={8}>
          <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={() => insertAt(lines.length)}>Line</Button>
          <Button size="xs" variant="default" leftSection={<IconHeading size={14} />} onClick={() => insertAt(lines.length, headingLine())}>Section heading</Button>
          {props.canUndo && <Button size="xs" variant="subtle" leftSection={<IconArrowBackUp size={14} />} onClick={props.onUndo}>Undo</Button>}
          <Text fz="xs" c="dimmed" ml="auto">
            <Kbd size="xs">Enter</Kbd> next row · <Kbd size="xs">Shift</Kbd>+<Kbd size="xs">Enter</Kbd> new line in description · <Kbd size="xs">Ctrl</Kbd>+<Kbd size="xs">D</Kbd> fill down · drop .xlsx / .csv here
          </Text>
        </Group>
      )}
    </div>
  );
}

function AutoTextarea(props: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  readOnly?: boolean;
  placeholder?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  "data-row": number;
  "data-col": string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  }, [props.value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={props.className}
      value={props.value}
      readOnly={props.readOnly}
      placeholder={props.placeholder}
      data-row={props["data-row"]}
      data-col={props["data-col"]}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={props.onKeyDown}
      onPaste={props.onPaste}
    />
  );
}

export { COLS };
