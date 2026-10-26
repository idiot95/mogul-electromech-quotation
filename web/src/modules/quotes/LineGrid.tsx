import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { ActionIcon, Button, Group, Menu } from "@mantine/core";
import { IconArrowBackUp, IconArrowDown, IconArrowUp, IconChevronDown, IconCopy, IconDotsVertical, IconGripVertical, IconHeading, IconPlus, IconRowInsertBottom, IconRowInsertTop, IconTrash } from "@tabler/icons-react";
import { money } from "../../lib/format";
import { blankLine, headingLine, lineAmount, newKey, parseNum, type EditLine } from "./lines";
import { rowsFromTSV, toNum, type PasteInput } from "../../../../shared/paste-engine";

type Col = "description" | "qty" | "unit" | "rate";
const COLS: Col[] = ["description", "qty", "unit", "rate"];
/** Navigable columns: the four editable ones plus the computed Amount (read-only, but selectable and copyable). */
const NCOLS = 5;
const AMOUNT = 4;
const UNITS = ["Nos.", "Pcs", "Set", "Pair", "Mtr", "Kg", "Ltr", "Lot", "Roll", "Box", "Coil", "Length", "LS"];

interface Pos {
  row: number;
  col: number;
}
/** "typed" = editing started by typing over the cell, so arrow keys commit and move (Excel's Enter mode).
 *  "edit" = started with Enter/F2/double-click, so arrow keys move the caret (Excel's Edit mode). */
interface Editing {
  row: number;
  col: number;
  mode: "typed" | "edit";
  original: string;
}

export interface GridApi {
  focusCell: (row: number, col: Col) => void;
}

// What this grid last put on the clipboard, so pasting it back goes cell-for-cell instead of through the smart paste.
let lastCopied = "";
const normClip = (t: string) => t.replace(/\r\n?/g, "\n").replace(/\n+$/, "");

const tsvCell = (v: string) => (/[\t\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Number text as pasted from Excel / a price list: "AED 1,250.00" → "1250". Leaves non-numbers as typed. */
function cleanNum(v: string): string {
  const t = v.trim();
  if (!t) return "";
  const n = toNum(t.replace(/[^\d.,\-]/g, ""));
  return n == null ? t : String(n);
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
  // Latest lines including changes made earlier in the same event (e.g. pick a unit, then Enter adds a line).
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const wrapRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null);
  const [dropping, setDropping] = useState(false);

  const [active, setActive] = useState<Pos>({ row: 0, col: 0 });
  const [anchor, setAnchor] = useState<Pos>({ row: 0, col: 0 });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [focused, setFocused] = useState(false);
  const selecting = useRef(false);
  /** Column where a run of Tabs started: Enter then returns there on the next line (Excel's Tab…Enter). */
  const tabOrigin = useRef<number | null>(null);

  const last = lines.length - 1;
  const isHeading = (r: number) => lines[r]?.kind === "heading";
  /** A heading's description spans the four editable columns: cols 0–3 on a heading row are one merged cell. */
  const cellCol = (r: number, c: number) => (isHeading(r) && c < AMOUNT ? 0 : c);
  const editable = (r: number, c: number) => !readOnly && c < AMOUNT && !!lines[r];

  // keep the selection inside the grid when lines are removed
  useEffect(() => {
    if (active.row > last || anchor.row > last) {
      setActive((a) => ({ ...a, row: Math.min(a.row, last) }));
      setAnchor((a) => ({ ...a, row: Math.min(a.row, last) }));
    }
    if (editing && editing.row > last) setEditing(null);
  }, [last]); // eslint-disable-line react-hooks/exhaustive-deps

  const range = {
    r0: Math.min(active.row, anchor.row),
    r1: Math.max(active.row, anchor.row),
    c0: Math.min(cellCol(active.row, active.col), cellCol(anchor.row, anchor.col)),
    c1: Math.max(cellCol(active.row, active.col), cellCol(anchor.row, anchor.col)),
  };
  const inRange = (r: number, c: number) =>
    r >= range.r0 && r <= range.r1 && (isHeading(r) && c === 0 ? range.c0 < AMOUNT : c >= range.c0 && c <= range.c1);
  const multi = range.r0 !== range.r1 || range.c0 !== range.c1;

  const cellEl = (r: number, c: number) => tableRef.current?.querySelector<HTMLElement>(`td[data-row="${r}"][data-col="${cellCol(r, c)}"]`);

  // scroll the active cell into view after every move
  useLayoutEffect(() => {
    if (focused) cellEl(active.row, active.col)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active.row, active.col, focused]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusGrid = () => wrapRef.current?.focus({ preventScroll: true });

  const select = (p: Pos, extend = false, keepTab = false) => {
    if (!keepTab) tabOrigin.current = null;
    const row = Math.max(0, Math.min(last, p.row));
    const col = Math.max(0, Math.min(NCOLS - 1, p.col));
    setActive({ row, col });
    if (!extend) setAnchor({ row, col });
  };

  const focusCell = (row: number, col: Col) => {
    setEditing(null);
    const p = { row, col: COLS.indexOf(col) };
    setActive(p);
    setAnchor(p);
    setTimeout(focusGrid, 0);
  };
  if (props.gridRef) props.gridRef.current = { focusCell };

  // ---------- reading and writing cells ----------
  const getText = (r: number, c: number): string => {
    const l = linesRef.current[r];
    if (!l) return "";
    if (l.kind === "heading") return c === 0 ? l.description : "";
    if (c === AMOUNT) {
      const a = lineAmount(l);
      return a == null ? "" : String(a);
    }
    return l[COLS[c]];
  };
  /** Writes a value into a copy of the lines (no-op for read-only or covered cells). */
  const put = (next: EditLine[], r: number, c: number, v: string) => {
    const l = next[r];
    if (!l || c >= AMOUNT) return;
    if (l.kind === "heading" && c !== 0) return;
    const key = COLS[c];
    next[r] = { ...l, [key]: key === "qty" || key === "rate" ? cleanNum(v) : key === "description" ? v : v.trim() };
  };

  const update = (i: number, patch: Partial<EditLine>) => {
    const next = linesRef.current.slice();
    next[i] = { ...next[i], ...patch };
    linesRef.current = next;
    props.onChange(next, false);
  };
  const structural = (next: EditLine[]) => {
    linesRef.current = next;
    props.onChange(next, true);
  };

  const insertAt = (i: number, l: EditLine = blankLine(props.defaultUnit)) => {
    const next = linesRef.current.slice();
    next.splice(i, 0, l);
    structural(next);
    setEditing(null);
    setActive({ row: i, col: 0 });
    setAnchor({ row: i, col: 0 });
    setTimeout(focusGrid, 0);
  };
  const removeRows = (from: number, to: number) => {
    const next = lines.filter((_, k) => k < from || k > to);
    structural(next.length ? next : [blankLine(props.defaultUnit)]);
    setEditing(null);
    const r = Math.max(0, Math.min(from, next.length - 1));
    setActive({ row: r, col: active.col });
    setAnchor({ row: r, col: active.col });
  };
  const move = (from: number, to: number) => {
    if (from === to || from + 1 === to) return;
    const next = linesRef.current.slice();
    const [l] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, l);
    structural(next);
  };

  const clearRange = () => {
    if (readOnly) return;
    const next = linesRef.current.slice();
    for (let r = range.r0; r <= range.r1; r++) for (let c = range.c0; c <= Math.min(range.c1, AMOUNT - 1); c++) put(next, r, c, "");
    structural(next);
  };

  // ---------- editing ----------
  const startEdit = (r: number, c: number, mode: Editing["mode"], typed?: string) => {
    if (!editable(r, c)) return;
    const col = cellCol(r, c);
    const original = getText(r, col);
    setActive({ row: r, col: c });
    setAnchor({ row: r, col: c });
    setEditing({ row: r, col, mode, original });
    if (typed != null) update(r, { [COLS[col]]: typed });
  };
  const stopEdit = (revert = false) => {
    if (editing && revert) update(editing.row, { [COLS[editing.col]]: editing.original });
    else if (editing && (editing.col === 1 || editing.col === 3)) {
      const v = getText(editing.row, editing.col);
      const c = cleanNum(v);
      if (c !== v) update(editing.row, { [COLS[editing.col]]: c });
    }
    setEditing(null);
    focusGrid();
  };

  /** Next row for Enter: down the same column (or back to where Tabbing started). Number columns skip section headings;
   *  Enter on a filled last line opens a new one. */
  const enterDown = (r: number, col: number) => {
    const c = tabOrigin.current ?? col;
    let n = r + 1;
    while (n <= last && c !== 0 && isHeading(n)) n++;
    if (n > last) {
      if (!readOnly && lines[r] && (lines[r].description.trim() || lines[r].qty.trim())) {
        tabOrigin.current = null;
        const next = [...linesRef.current, blankLine(props.defaultUnit)];
        structural(next);
        setActive({ row: lines.length, col: c });
        setAnchor({ row: lines.length, col: c });
      }
      return;
    }
    select({ row: n, col: c });
  };

  const tabMove = (back: boolean): boolean => {
    let { row, col } = active;
    if (isHeading(row) && col < AMOUNT) col = back ? 0 : AMOUNT - 1;
    col += back ? -1 : 1;
    if (col < 0) {
      row--;
      col = NCOLS - 1;
    } else if (col >= NCOLS) {
      row++;
      col = 0;
    }
    if (row < 0 || row > last) return false;
    const origin = tabOrigin.current ?? active.col;
    select({ row, col });
    tabOrigin.current = row === active.row ? origin : null;
    return true;
  };

  const arrow = (key: string, mod: boolean, extend: boolean) => {
    let { row, col } = active;
    if (key === "ArrowDown") row = mod ? last : row + 1;
    else if (key === "ArrowUp") row = mod ? 0 : row - 1;
    else if (key === "ArrowRight") {
      if (isHeading(row) && col < AMOUNT) col = AMOUNT - 1;
      col = mod ? NCOLS - 1 : col + 1;
    } else if (key === "ArrowLeft") {
      if (isHeading(row) && col < AMOUNT) col = 0;
      col = mod ? 0 : col - 1;
    }
    select({ row, col }, extend);
  };

  // ---------- keyboard ----------
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    const inEditor = !!t.closest("[data-editor]");
    if (t !== wrapRef.current && !inEditor) return; // row menu, buttons, etc.
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;

    if (editing && inEditor) {
      const desc = editing.col === 0;
      if (k === "Escape") {
        e.preventDefault();
        stopEdit(true);
      } else if (k === "Enter" && !(desc && (e.shiftKey || e.altKey))) {
        e.preventDefault();
        const { row, col } = editing;
        stopEdit();
        if (e.shiftKey) select({ row: row - 1, col: active.col });
        else enterDown(row, col === 0 ? active.col : col);
      } else if (k === "Tab") {
        e.preventDefault();
        stopEdit();
        tabMove(e.shiftKey);
      } else if (editing.mode === "typed" && k.startsWith("Arrow") && !e.defaultPrevented) {
        e.preventDefault();
        stopEdit();
        arrow(k, false, false);
      }
      return;
    }

    if (k.startsWith("Arrow")) {
      e.preventDefault();
      if (e.altKey && k === "ArrowDown" && active.col === 2) startEdit(active.row, 2, "edit");
      else arrow(k, mod, e.shiftKey);
    } else if (k === "Tab") {
      if (tabMove(e.shiftKey)) e.preventDefault();
    } else if (k === "Home" || k === "End") {
      e.preventDefault();
      select({ row: mod ? (k === "Home" ? 0 : last) : active.row, col: k === "Home" ? 0 : NCOLS - 1 }, e.shiftKey);
    } else if (k === "PageDown" || k === "PageUp") {
      e.preventDefault();
      select({ row: active.row + (k === "PageDown" ? 10 : -10), col: active.col }, e.shiftKey);
    } else if (mod && e.shiftKey && k === "Enter") {
      e.preventDefault();
      if (!readOnly) insertAt(range.r1 + 1);
    } else if (mod && e.shiftKey && (k === "Delete" || k === "Backspace")) {
      e.preventDefault();
      if (!readOnly) removeRows(range.r0, range.r1);
    } else if (k === "Enter" || k === "F2") {
      e.preventDefault();
      if (editable(active.row, active.col)) startEdit(active.row, active.col, "edit");
      else if (k === "Enter") enterDown(active.row, active.col);
    } else if (k === "Delete") {
      e.preventDefault();
      clearRange();
    } else if (k === "Backspace") {
      e.preventDefault();
      if (multi) clearRange();
      else startEdit(active.row, active.col, "typed", "");
    } else if (k === "Escape") {
      setAnchor(active);
    } else if (mod && k.toLowerCase() === "a") {
      e.preventDefault();
      setAnchor({ row: 0, col: 0 });
      setActive({ row: last, col: NCOLS - 1 });
    } else if (mod && k.toLowerCase() === "d") {
      // Ctrl+D: fill down — the top row of the selection into the rows below it (or the row above into this one)
      e.preventDefault();
      if (readOnly) return;
      const src = range.r0 === range.r1 ? range.r0 - 1 : range.r0;
      if (src < 0) return;
      const next = linesRef.current.slice();
      for (let r = src + 1; r <= range.r1; r++) for (let c = range.c0; c <= Math.min(range.c1, AMOUNT - 1); c++) put(next, r, c, getText(src, c));
      structural(next);
    } else if (k.length === 1 && !mod && !e.altKey) {
      // typing over a cell replaces it, like Excel
      if (editable(active.row, active.col)) {
        e.preventDefault();
        startEdit(active.row, active.col, "typed", k);
      }
    }
  }

  // ---------- clipboard ----------
  const rangeTSV = () => {
    const rows: string[] = [];
    for (let r = range.r0; r <= range.r1; r++) {
      const cells: string[] = [];
      for (let c = range.c0; c <= range.c1; c++) cells.push(tsvCell(getText(r, c)));
      rows.push(cells.join("\t"));
    }
    return rows.join("\n");
  };

  function onCopy(e: ClipboardEvent<HTMLDivElement>, cut = false) {
    if (e.target !== wrapRef.current) return; // inside an editor: normal text copy
    e.preventDefault();
    const text = rangeTSV();
    lastCopied = normClip(text);
    e.clipboardData.setData("text/plain", text);
    if (cut) clearRange();
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    const inEditor = !!t.closest("[data-editor]");
    if (t !== wrapRef.current && !inEditor) return;
    e.stopPropagation(); // the page-level paste handler is for when nothing in the grid is focused
    if (readOnly) return;
    const text = e.clipboardData.getData("text/plain");
    const html = e.clipboardData.getData("text/html");
    const img = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (img && !text.trim() && !inEditor) {
      // a screenshot of an enquiry goes to the file reader (OCR)
      e.preventDefault();
      setEditing(null);
      props.onFileDrop(new File([img], "enquiry-screenshot.png", { type: img.type }));
      return;
    }
    const clip = normClip(text);
    const isMulti = /\t|\n/.test(clip);
    if (inEditor && !isMulti) return; // single value into the cell being edited: normal paste
    e.preventDefault();
    if (!clip && !html) return;
    const r0 = editing ? editing.row : range.r0;
    const c0 = editing ? editing.col : range.c0;
    const own = clip === lastCopied;

    // Lines from an enquiry (Excel sheet, email list) pasted into the description column go through the smart paste preview.
    if (isMulti && c0 === 0 && !own) {
      setEditing(null);
      props.onBulkPaste({ text, html: html && /<table/i.test(html) ? html : null }, r0);
      return;
    }

    const grid = isMulti ? rowsFromTSV(clip) : [[clip]];
    const next = linesRef.current.slice();
    if (!isMulti && multi && !editing) {
      // one value into a selected range fills every cell
      for (let r = range.r0; r <= range.r1; r++) for (let c = range.c0; c <= Math.min(range.c1, AMOUNT - 1); c++) put(next, r, c, clip);
    } else {
      // block paste from the active cell; a column of numbers pasted into Qty/Rate skips section headings
      const skipHeadings = !own && c0 > 0;
      let r = r0;
      for (const cells of grid) {
        while (skipHeadings && r < next.length && next[r].kind === "heading") r++;
        if (r >= next.length) next.push(blankLine(props.defaultUnit));
        cells.forEach((v, j) => put(next, r, c0 + j, v));
        r++;
      }
      const w = Math.max(...grid.map((g) => g.length));
      setAnchor({ row: r0, col: c0 });
      setActive({ row: Math.max(r0, r - 1), col: Math.min(NCOLS - 1, c0 + w - 1) });
    }
    setEditing(null);
    structural(next);
    focusGrid();
  }

  // ---------- mouse ----------
  const inOwnEditor = (r: number, c: number) => !!editing && editing.row === r && editing.col === cellCol(r, c);
  function onCellPointerDown(e: PointerEvent<HTMLTableCellElement>, r: number, c: number) {
    // touch and pen act on tap (onClick) so a swipe can still scroll the page
    if (e.pointerType !== "mouse" || e.button !== 0 || inOwnEditor(r, c)) return;
    if ((e.target as HTMLElement).closest("[data-unit-btn]")) {
      startEdit(r, 2, "edit");
      return;
    }
    if (editing) setEditing(null);
    select({ row: r, col: c }, e.shiftKey);
    focusGrid();
    selecting.current = true;
  }
  function onCellClick(e: React.MouseEvent<HTMLTableCellElement>, r: number, c: number) {
    if ((e.nativeEvent as globalThis.PointerEvent).pointerType === "mouse" || inOwnEditor(r, c)) return;
    select({ row: r, col: c });
    if (editable(r, c)) startEdit(r, c, "edit");
    else focusGrid();
  }
  function onCellPointerEnter(r: number, c: number) {
    if (selecting.current) setActive({ row: r, col: c });
  }
  useEffect(() => {
    const up = () => (selecting.current = false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  function onDrop(e: DragEvent) {
    setDropping(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      e.preventDefault();
      props.onFileDrop(f);
    }
  }

  // ---------- render ----------
  const cellProps = (r: number, c: number, extra = "") => {
    const isActive = focused && active.row === r && cellCol(r, active.col) === c;
    const sel = focused && multi && inRange(r, c);
    return {
      "data-row": r,
      "data-col": c,
      className: ["gc", extra, sel ? "sel" : "", isActive ? "active" : "", editing && editing.row === r && editing.col === c ? "editing" : ""].join(" "),
      onPointerDown: (e: PointerEvent<HTMLTableCellElement>) => onCellPointerDown(e, r, c),
      onPointerEnter: () => onCellPointerEnter(r, c),
      onMouseDown: (e: React.MouseEvent) => {
        if (!inOwnEditor(r, c)) e.preventDefault(); // no text selection or focus change: the grid owns focus
      },
      onClick: (e: React.MouseEvent<HTMLTableCellElement>) => onCellClick(e, r, c),
      onDoubleClick: () => startEdit(r, c, "edit"),
    };
  };
  const isEditing = (r: number, c: number) => !!editing && editing.row === r && editing.col === c;

  let sr = 0;
  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      data-line-grid
      className={"lg-wrap" + (dropping ? " dropzone" : "")}
      onKeyDown={onKeyDown}
      onCopy={(e) => onCopy(e)}
      onCut={(e) => onCopy(e, !readOnly)}
      onPaste={onPaste}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        const to = e.relatedTarget as HTMLElement | null;
        if (to && (wrapRef.current?.contains(to) || to.closest("[data-lg-pop]"))) return;
        setFocused(false);
        setEditing(null);
      }}
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
            <th>Description</th>
            <th className="r">Qty</th>
            <th>Unit</th>
            <th className="r">Rate ({props.currency})</th>
            <th className="r">Amount ({props.currency})</th>
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
                  onClick={() => {
                    // click the number to select the whole line
                    setAnchor({ row: i, col: 0 });
                    setActive({ row: i, col: NCOLS - 1 });
                    focusGrid();
                  }}
                  title={readOnly ? undefined : "Drag to reorder"}
                >
                  {!readOnly && <IconGripVertical size={12} className="grip" />}
                  {heading ? "§" : sr}
                </td>
                <td colSpan={heading ? 4 : 1} {...cellProps(i, 0, "desc")}>
                  {isEditing(i, 0) ? (
                    <AutoTextarea className="cell" value={l.description} onChange={(v) => update(i, { description: v })} />
                  ) : (
                    <div className={"cell" + (l.description ? "" : " ph")}>
                      {l.description || (heading ? "Section" : "")}
                    </div>
                  )}
                </td>
                {!heading && (
                  <>
                    <td {...cellProps(i, 1, "qty")}>
                      {isEditing(i, 1) ? (
                        <CellInput className="cell n" inputMode="decimal" value={l.qty} onChange={(v) => update(i, { qty: v })} />
                      ) : (
                        <div className="cell n">{l.qty}</div>
                      )}
                    </td>
                    <td {...cellProps(i, 2, "unit")}>
                      {isEditing(i, 2) ? (
                        <UnitEditor value={l.unit} openList={editing!.mode === "edit"} onChange={(v) => update(i, { unit: v })} onPick={(v) => { update(i, { unit: v }); setEditing(null); focusGrid(); }} />
                      ) : (
                        <div className="cell">
                          {l.unit}
                          {!readOnly && <span className="dd" data-unit-btn aria-label="Choose unit"><IconChevronDown size={13} /></span>}
                        </div>
                      )}
                    </td>
                    <td {...cellProps(i, 3, "rate" + (!readOnly && l.description.trim() && parseNum(l.rate) == null ? " missing" : ""))}>
                      {isEditing(i, 3) ? (
                        <CellInput className="cell n" inputMode="decimal" value={l.rate} onChange={(v) => update(i, { rate: v })} />
                      ) : (
                        <div className="cell n">{l.rate}</div>
                      )}
                    </td>
                  </>
                )}
                <td {...cellProps(i, AMOUNT, "amt")}>
                  <div className="cell n">{heading ? "" : amt == null ? "–" : money(amt)}</div>
                </td>
                <td className="act">
                  {!readOnly && (
                    <Menu position="bottom-end" withinPortal shadow="md" width={210}>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" className="rowmenu" aria-label="Row actions" tabIndex={-1}><IconDotsVertical size={16} /></ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconRowInsertTop size={15} />} onClick={() => insertAt(i)}>Insert line above</Menu.Item>
                        <Menu.Item leftSection={<IconRowInsertBottom size={15} />} onClick={() => insertAt(i + 1)}>Insert line below</Menu.Item>
                        <Menu.Item leftSection={<IconHeading size={15} />} onClick={() => insertAt(i, headingLine())}>Insert heading above</Menu.Item>
                        <Menu.Item
                          leftSection={<IconHeading size={15} />}
                          onClick={() => {
                            const next = linesRef.current.slice();
                            next[i] = l.kind === "heading" ? { ...l, kind: "item", unit: props.defaultUnit } : { ...l, kind: "heading", qty: "", rate: "", unit: "" };
                            structural(next);
                          }}
                        >
                          {heading ? "Change to item line" : "Change to heading"}
                        </Menu.Item>
                        <Menu.Item leftSection={<IconCopy size={15} />} onClick={() => { const next = linesRef.current.slice(); next.splice(i + 1, 0, { ...l, key: newKey() }); structural(next); }}>Duplicate</Menu.Item>
                        <Menu.Item leftSection={<IconArrowUp size={15} />} disabled={i === 0} onClick={() => move(i, i - 1)}>Move up</Menu.Item>
                        <Menu.Item leftSection={<IconArrowDown size={15} />} disabled={i === lines.length - 1} onClick={() => move(i, i + 2)}>Move down</Menu.Item>
                        <Menu.Divider />
                        <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={() => removeRows(i, i)}>Delete line</Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!readOnly && (
        <Group className="lg-foot no-print" gap="xs" px="xs" py={8}>
          <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={() => insertAt(lines.length)}>Add Line</Button>
          <Button size="xs" variant="default" leftSection={<IconHeading size={14} />} onClick={() => insertAt(lines.length, headingLine())}>Add Section</Button>
          {props.canUndo && <Button size="xs" variant="subtle" leftSection={<IconArrowBackUp size={14} />} onClick={props.onUndo}>Undo</Button>}
        </Group>
      )}
    </div>
  );
}

/** Focuses itself on mount with the caret at the end. */
function useAutoFocus<T extends HTMLInputElement | HTMLTextAreaElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const n = el.value.length;
    el.setSelectionRange(n, n);
  }, []);
  return ref;
}

function CellInput(props: { value: string; onChange: (v: string) => void; className?: string; inputMode?: "decimal" }) {
  const ref = useAutoFocus<HTMLInputElement>();
  return <input ref={ref} data-editor className={props.className} inputMode={props.inputMode} value={props.value} onChange={(e) => props.onChange(e.target.value)} />;
}

function AutoTextarea(props: { value: string; onChange: (v: string) => void; className?: string }) {
  const ref = useAutoFocus<HTMLTextAreaElement>();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  }, [props.value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <textarea ref={ref} data-editor rows={1} className={props.className} value={props.value} onChange={(e) => props.onChange(e.target.value)} />;
}

/** Unit cell editor: free text with a pick list. ↑/↓ move through the list, Enter picks, Esc cancels. */
function UnitEditor(props: { value: string; openList: boolean; onChange: (v: string) => void; onPick: (v: string) => void }) {
  const ref = useAutoFocus<HTMLInputElement>();
  const [filter, setFilter] = useState(!props.openList);
  const q = props.value.trim().toLowerCase();
  const opts = filter && q ? UNITS.filter((u) => u.toLowerCase().includes(q)) : UNITS;
  const cur = opts.findIndex((u) => u.toLowerCase() === q);
  const [hi, setHi] = useState(cur >= 0 ? cur : 0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setPos({ left: r.left, top: r.bottom, width: Math.max(r.width, 120) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    listRef.current?.children[hi]?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  return (
    <>
      <input
        ref={ref}
        data-editor
        className="cell"
        value={props.value}
        onChange={(e) => {
          setFilter(true);
          setHi(0);
          props.onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (opts.length) setHi((h) => (h + (e.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length);
          } else if (e.key === "Enter" && !e.shiftKey && opts[hi]) {
            props.onChange(opts[hi]); // the grid then commits and moves down
          }
        }}
      />
      {pos && opts.length > 0 &&
        createPortal(
          <div ref={listRef} data-lg-pop className="lg-pop" style={{ left: pos.left, top: pos.top, minWidth: pos.width }}>
            {opts.map((u, k) => (
              <div
                key={u}
                className={"opt" + (k === hi ? " hi" : "") + (u.toLowerCase() === q ? " cur" : "")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  props.onPick(u);
                }}
                onMouseEnter={() => setHi(k)}
              >
                {u}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

export { COLS };
