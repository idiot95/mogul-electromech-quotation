import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router";
import { api } from "../../lib/api";
import type { Customer, Quote, QuoteHeader } from "../../lib/types";
import { dateFmt, money, quoteNo, todayUAE } from "../../lib/format";
import { useApp } from "../../core/app-context";
import { CustomerForm } from "../../core/CustomerForm";
import { extractFile, IMPORT_ACCEPT, kindOf } from "../../lib/extract";
import type { PasteInput } from "../../../../shared/paste-engine";
import { LineGrid, type GridApi } from "./LineGrid";
import { PastePreview, type PasteMode } from "./PastePreview";
import { blankLine, computeTotals, fromLines, fromParsed, isBlank, lineAmount, parseNum, toLines, type EditLine } from "./lines";
import { pdfFileName } from "./QuoteDocument";
import { Page } from "../../core/Page";
import { downloadSheet } from "../../lib/sheets";
import { CustomerPicker } from "./CustomerPicker";
import { Workings } from "./Workings";
import { EmailDialog } from "./EmailDialog";
import { StatusBadge } from "./status";
import { Outcome } from "./Outcome";
import { ActionIcon, Alert, Anchor, Badge, Button, Center, Divider, Grid, Group, Loader, Menu, Modal, NumberInput, Paper, Progress, Select, SimpleGrid, Stack, Text, TextInput, Textarea, Timeline, Title, FileButton } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { modals } from "@mantine/modals";
import { IconAlertTriangle, IconBan, IconDots, IconFileSpreadsheet, IconCopy, IconDeviceFloppy, IconFileImport, IconGitBranch, IconLock, IconMail, IconPrinter, IconRefresh, IconTrash, IconUser } from "@tabler/icons-react";

const LAST_SALESMAN = "mogul.lastSalesman";

function emptyHeader(): QuoteHeader {
  let sm: number | null = null;
  try {
    sm = Number(localStorage.getItem(LAST_SALESMAN)) || null;
  } catch {
    /* storage unavailable */
  }
  return {
    quote_date: todayUAE(),
    customer_id: null,
    customer_name: "",
    customer_address: null,
    attention: null,
    enquiry_ref: null,
    salesman_id: sm,
    payment_terms: null,
    validity: null,
    delivery_terms: null,
    vat_terms: null,
    vat_rate: 5,
    notes: null,
    internal_notes: null,
  };
}

export function QuoteEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { settings, salesmen, toast } = useApp();
  const cfg = settings?.quotes;
  const defaultUnit = cfg?.defaultUnit || "Nos.";

  const [quote, setQuote] = useState<Quote | null>(null);
  const [h, setH] = useState<QuoteHeader>(emptyHeader);
  const [lines, setLines] = useState<EditLine[]>([blankLine(defaultUnit)]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [history, setHistory] = useState<EditLine[][]>([]);
  const [paste, setPaste] = useState<{ input: PasteInput; row: number | null; previews?: string[]; ocr?: boolean; file?: File } | null>(null);
  const [reading, setReading] = useState<{ label: string; pct: number | null } | null>(null);
  const [workingsVer, setWorkingsVer] = useState(0);
  // imported originals (PDF, screenshot, email) waiting for the quote's first save to be attached as workings
  const pendingWorkings = useRef<File[]>([]);
  const [newCust, setNewCust] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const gridRef = useRef<GridApi | null>(null);
  const lastStructural = useRef(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const readOnly = !!quote?.superseded_by;

  // ---------- load ----------
  useEffect(() => {
    api.get<Customer[]>("/customers?all=1").then(setCustomers, (e) => toast(e.message, true));
  }, []);

  useEffect(() => {
    if (!id) {
      setQuote(null);
      setH({ ...emptyHeader(), vat_rate: cfg?.vatRate ?? 5 });
      setLines([blankLine(defaultUnit)]);
      setHistory([]);
      setDirty(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get<Quote>(`/quotes/${id}`)
      .then((q) => applyQuote(q))
      .catch((e) => toast(e.message, true))
      .finally(() => setLoading(false));
  }, [id]);

  function applyQuote(q: Quote) {
    setQuote(q);
    const { quote_date, customer_id, customer_name, customer_address, attention, enquiry_ref, salesman_id, payment_terms, validity, delivery_terms, vat_terms, vat_rate, notes, internal_notes } = q;
    setH({ quote_date, customer_id, customer_name, customer_address, attention, enquiry_ref, salesman_id, payment_terms, validity, delivery_terms, vat_terms, vat_rate, notes, internal_notes });
    const ls = fromLines(q.lines);
    setLines(q.superseded_by ? ls : [...ls, blankLine(defaultUnit)]);
    setHistory([]);
    setDirty(false);
  }

  // ---------- edits ----------
  const setField = <K extends keyof QuoteHeader>(k: K, v: QuoteHeader[K]) => {
    setH((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const changeLines = useCallback((next: EditLine[], structural: boolean) => {
    setLines((prev) => {
      if (structural) setHistory((hs) => [...hs.slice(-30), prev]);
      return next;
    });
    lastStructural.current = structural;
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    setHistory((hs) => {
      if (!hs.length) return hs;
      setLines(hs[hs.length - 1]);
      return hs.slice(0, -1);
    });
    lastStructural.current = false;
    setDirty(true);
  }, []);

  function pickCustomer(c: Customer) {
    setH((p) => ({
      ...p,
      customer_id: c.id,
      customer_name: c.name,
      customer_address: c.address,
      attention: c.contact_person || p.attention,
      payment_terms: c.payment_terms || cfg?.paymentTerms || null,
      validity: c.validity || cfg?.validity || null,
      delivery_terms: c.delivery_terms || cfg?.deliveryTerms || null,
      vat_terms: c.vat_terms || cfg?.vatTerms || null,
    }));
    setDirty(true);
  }

  function applyPaste(items: Parameters<typeof fromParsed>[0], mode: PasteMode, enquiry: string | null) {
    const incoming = fromParsed(items, defaultUnit);
    const kept = lines.filter((l) => !isBlank(l));
    let next: EditLine[];
    let firstNew: number;
    if (mode === "replace" || !kept.length) {
      next = [...incoming];
      firstNew = 0;
    } else if (mode === "insert" && paste?.row != null) {
      const at = Math.min(paste.row, lines.length);
      const before = lines.slice(0, at).filter((l) => !isBlank(l));
      const after = lines.slice(at).filter((l) => !isBlank(l));
      next = [...before, ...incoming, ...after];
      firstNew = before.length;
    } else {
      next = [...kept, ...incoming];
      firstNew = kept.length;
    }
    next.push(blankLine(defaultUnit));
    changeLines(next, true);
    if (enquiry) setField("enquiry_ref", enquiry);
    if (paste?.file) keepOriginal(paste.file);
    setPaste(null);
    const firstItem = next.findIndex((l, i) => i >= firstNew && l.kind === "item");
    setTimeout(() => gridRef.current?.focusCell(firstItem >= 0 ? firstItem : firstNew, "rate"), 30);
    const n = incoming.filter((l) => l.kind === "item").length;
    toast(`${n} line${n === 1 ? "" : "s"} added — enter the rates`);
  }

  async function onFile(file: File) {
    if (!kindOf(file)) return toast(`Can't read ${file.name}. Use Excel / CSV, a PDF, a screenshot or photo, or an email (.eml / .msg).`, true);
    setReading({ label: "Reading the file…", pct: null });
    try {
      const r = await extractFile(file, (label, pct) => setReading({ label, pct }));
      setPaste({ input: r.input, row: null, previews: r.previews, ocr: r.ocr, file: kindOf(file) === "sheet" ? undefined : file });
    } catch (e) {
      toast("Could not read the file: " + (e as Error).message, true);
    } finally {
      setReading(null);
    }
  }

  const uploadWorking = async (quoteId: number, f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("owner_type", "quote");
    fd.append("owner_id", String(quoteId));
    await api.post("/files", fd);
  };
  /** The original enquiry is kept with the quote's workings (now, or on the first save of a new quote). */
  function keepOriginal(f: File) {
    if (f.size > 8 * 1024 * 1024) return;
    if (!quote) {
      pendingWorkings.current.push(f);
      return;
    }
    uploadWorking(quote.id, f).then(() => setWorkingsVer((v) => v + 1), () => toast(`Couldn't attach ${f.name} to the workings`, true));
  }

  // ---------- save ----------
  const save = useCallback(async (): Promise<Quote | null> => {
    if (readOnly) return quote;
    if (!h.customer_name.trim()) {
      toast("Choose a customer first", true);
      return null;
    }
    setSaving(true);
    try {
      const payload = { ...h, lines: toLines(lines) };
      const saved = quote ? await api.put<Quote>(`/quotes/${quote.id}`, payload) : await api.post<Quote>("/quotes", payload);
      try {
        if (h.salesman_id) localStorage.setItem(LAST_SALESMAN, String(h.salesman_id));
      } catch {
        /* ignore */
      }
      setDirty(false);
      dirtyRef.current = false;
      for (const f of pendingWorkings.current.splice(0)) await uploadWorking(saved.id, f).catch(() => toast(`Couldn't attach ${f.name} to the workings`, true));
      if (!quote) {
        setQuote(saved);
        toast(`Saved as ${saved.base_number}`);
        navigate(`/quotes/${saved.id}`, { replace: true });
      } else {
        setQuote(saved);
        toast("Saved");
      }
      return saved;
    } catch (e) {
      toast((e as Error).message, true);
      return null;
    } finally {
      setSaving(false);
    }
  }, [h, lines, quote, readOnly]);

  // ---------- keyboard + page-level paste ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === "z" && history.length && lastStructural.current) {
        e.preventDefault();
        undo();
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      if (readOnly || paste) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable], [data-workings], [data-line-grid], .mantine-Modal-root")) return;
      const text = e.clipboardData?.getData("text/plain") || "";
      const img = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
      if (img && !text.trim()) {
        // a screenshot of an enquiry: read it with OCR
        e.preventDefault();
        onFile(new File([img], `enquiry-screenshot-${todayUAE()}.png`, { type: img.type }));
        return;
      }
      if (!text.trim()) return;
      const html = e.clipboardData?.getData("text/html") || "";
      e.preventDefault();
      setPaste({ input: { text, html: /<table/i.test(html) ? html : null }, row: null });
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("paste", onPaste);
    };
  }, [save, undo, history.length, readOnly, paste]);

  // ---------- unsaved-changes guard ----------
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRef.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === "blocked") {
      modals.openConfirmModal({
        title: "Unsaved changes",
        children: <Text fz="sm">Leave this quote without saving?</Text>,
        labels: { confirm: "Leave without saving", cancel: "Stay" },
        confirmProps: { color: "red" },
        onConfirm: () => blocker.proceed?.(),
        onCancel: () => blocker.reset?.(),
        closeOnClickOutside: false,
        closeOnEscape: false,
        withCloseButton: false,
      });
    }
  }, [blocker.state]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);

  // ---------- actions ----------
  async function act(path: string, body?: unknown, msg?: string) {
    if (dirty && !(await save())) return;
    try {
      const q = await api.post<Quote>(`/quotes/${quote!.id}${path}`, body);
      if (q.id !== quote!.id) navigate(`/quotes/${q.id}`);
      else applyQuote(q);
      if (msg) toast(msg);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  async function print() {
    const q = dirty || !quote ? await save() : quote;
    if (q) navigate(`/quotes/${q.id}/print`);
  }

  const ask = (title: string, body: string, label: string, fn: () => void, danger = false) =>
    modals.openConfirmModal({
      title,
      children: <Text fz="sm">{body}</Text>,
      labels: { confirm: label, cancel: "Cancel" },
      confirmProps: danger ? { color: "red" } : undefined,
      onConfirm: fn,
    });

  async function del() {
    if (!quote) return;
    try {
      await api.del(`/quotes/${quote.id}`);
      setDirty(false);
      dirtyRef.current = false;
      toast("Draft deleted");
      navigate("/quotes");
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  if (loading || !cfg) return <Center py={80}><Loader /></Center>;

  const t = computeTotals(lines, Number(h.vat_rate) || 0);
  const latestRev = quote?.revisions[quote.revisions.length - 1];
  const nextRev = (latestRev?.rev ?? quote?.rev ?? 0) + 1;
  const cur = quote?.currency || cfg.currency;
  const term = (k: "payment_terms" | "validity" | "delivery_terms" | "vat_terms", label: string) => (
    <TextInput
      label={label}
      value={h[k] || ""}
      readOnly={readOnly}
      onChange={(e) => setField(k, e.currentTarget.value)}
    />
  );

  const no = quote ? quoteNo(quote.base_number, quote.rev) : "New Quotation";

  async function exportExcel() {
    const rows: (string | number | null)[][] = [
      ["Quotation No.", quote ? no : ""],
      ["Date", dateFmt(h.quote_date)],
      ["Customer", h.customer_name],
      ["Enquiry Reference", h.enquiry_ref || ""],
      ["Salesperson", salesmen.find((s) => s.id === h.salesman_id)?.name || ""],
      [],
      ["Sr", "Description", "Qty", "Unit", `Rate (${cur})`, `Amount (${cur})`],
    ];
    let sr = 0;
    for (const l of lines) {
      if (isBlank(l)) continue;
      if (l.kind === "heading") rows.push(["", l.description]);
      else rows.push([++sr, l.description, parseNum(l.qty), l.unit, parseNum(l.rate), lineAmount(l)]);
    }
    rows.push([], ["", "", "", "", "Subtotal", t.subtotal], ["", "", "", "", `VAT ${h.vat_rate}%`, t.vat], ["", "", "", "", "Total", t.total]);
    await downloadSheet(quote ? pdfFileName(quote) : "New Quotation", quote ? no : "Quotation", rows, [8, 60, 10, 8, 14, 16]);
  }

  return (
    <Page
      crumbs={[{ label: "Quotations", to: "/quotes" }]}
      title={<Title order={2}>{no}</Title>}
      badges={
        <>
          {quote && <StatusBadge s={quote.status} size="md" />}
          {readOnly && <Badge color="gray" variant="light" leftSection={<IconLock size={12} />}>Read-only</Badge>}
          {dirty && <Badge color="orange" variant="light">Unsaved</Badge>}
        </>
      }
      actions={
        <>
          <Button variant="default" leftSection={<IconFileSpreadsheet size={16} />} onClick={exportExcel} disabled={!lines.some((l) => !isBlank(l))}>Export to Excel</Button>
          <Button variant="default" leftSection={<IconMail size={16} />} disabled={!quote}
            onClick={async () => { if (dirty && !(await save())) return; setEmailOpen(true); }}>
            Email
          </Button>
          <Button variant="default" leftSection={<IconPrinter size={16} />} onClick={print} loading={saving}>Print / PDF</Button>
          {!readOnly && <Button onClick={() => save()} loading={saving} leftSection={<IconDeviceFloppy size={16} />}>Save</Button>}
          {quote && (
            <Menu position="bottom-end" shadow="md" width={230}>
              <Menu.Target>
                <ActionIcon variant="default" size={36} aria-label="More actions"><IconDots size={18} /></ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {!readOnly && (
                  <Menu.Item leftSection={<IconGitBranch size={16} />}
                    onClick={() => ask(`Create ${quoteNo(quote.base_number, nextRev)}?`, "The current version is kept read-only.", "Create Revision", () => act("/revise", undefined, "Revision created"))}>
                    Create Revision (REV {String(nextRev).padStart(2, "0")})
                  </Menu.Item>
                )}
                <Menu.Item leftSection={<IconCopy size={16} />} onClick={() => act("/duplicate", undefined, "Copied to a new quotation")}>Duplicate as New Quotation</Menu.Item>
                {!readOnly && <Menu.Divider />}
                {!readOnly && (quote.status !== "cancelled" ? (
                  <Menu.Item color="red" leftSection={<IconBan size={16} />}
                    onClick={() => ask("Cancel this quotation?", "It remains in the list and is excluded from totals.", "Cancel Quotation", () => act("/status", { status: "cancelled" }, "Quotation cancelled"), true)}>
                    Cancel Quotation
                  </Menu.Item>
                ) : (
                  <Menu.Item leftSection={<IconRefresh size={16} />} onClick={() => act("/status", { status: "draft" }, "Re-opened")}>Re-open Quotation</Menu.Item>
                ))}
                {!readOnly && quote.status === "draft" && (
                  <Menu.Item color="red" leftSection={<IconTrash size={16} />}
                    onClick={() => ask(`Delete ${no}?`, "This draft is deleted permanently.", "Delete", del, true)}>
                    Delete Draft
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          )}
        </>
      }
    >
      {readOnly && latestRev && (
        <Alert color="orange" variant="light" icon={<IconLock size={18} />}>
          This revision has been superseded.{" "}
          <Anchor component={Link} to={`/quotes/${latestRev.id}`} fw={600}>Open {quoteNo(quote!.base_number, latestRev.rev)}</Anchor>
        </Alert>
      )}

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 8.6 }}>
          <Stack gap="lg">
            <Paper p="lg">
              <Stack gap="md">
                <CustomerPicker
                  label="Customer"
                  customers={customers}
                  value={h.customer_name}
                  selectedId={h.customer_id}
                  readOnly={readOnly}
                  onType={(v) => { setH((p) => ({ ...p, customer_name: v, customer_id: null })); setDirty(true); }}
                  onPick={pickCustomer}
                  onNew={(name) => setNewCust(name)}
                />
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                  <TextInput label="Enquiry Reference" value={h.enquiry_ref || ""} readOnly={readOnly} onChange={(e) => setField("enquiry_ref", e.currentTarget.value)} />
                  <Select
                    label="Salesperson"
                    leftSection={<IconUser size={16} />}
                    value={h.salesman_id ? String(h.salesman_id) : null}
                    readOnly={readOnly}
                    onChange={(v) => setField("salesman_id", v ? Number(v) : null)}
                    data={salesmen.filter((s) => s.active || s.id === h.salesman_id).map((s) => ({ value: String(s.id), label: s.name }))}
                  />
                  <DateInput label="Quotation Date" valueFormat="DD MMM YYYY" value={h.quote_date} readOnly={readOnly} onChange={(v) => v && setField("quote_date", String(v).slice(0, 10))} />
                </SimpleGrid>
                {h.customer_name && (
                  <>
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                      <Textarea label="Address" autosize minRows={2} value={h.customer_address || ""} readOnly={readOnly} onChange={(e) => setField("customer_address", e.currentTarget.value)} />
                      <TextInput label="Attention" value={h.attention || ""} readOnly={readOnly} onChange={(e) => setField("attention", e.currentTarget.value)} />
                    </SimpleGrid>
                    <Divider label="Terms" labelPosition="left" mt={4} />
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                      {term("payment_terms", "Payment Terms")}
                      {term("validity", "Validity")}
                      {term("delivery_terms", "Delivery Terms")}
                      {term("vat_terms", "VAT Terms")}
                    </SimpleGrid>
                  </>
                )}
              </Stack>
            </Paper>

            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Title order={4}>Line Items</Title>
                {!readOnly && (
                  <FileButton onChange={(f) => f && onFile(f)} accept={IMPORT_ACCEPT}>
                    {(p) => <Button {...p} size="xs" variant="default" leftSection={<IconFileImport size={14} />}>Import File</Button>}
                  </FileButton>
                )}
              </Group>
              <LineGrid
                lines={lines}
                readOnly={readOnly}
                defaultUnit={defaultUnit}
                currency={cur}
                onChange={changeLines}
                onBulkPaste={(input, row) => setPaste({ input, row })}
                onFileDrop={onFile}
                onUndo={undo}
                canUndo={history.length > 0}
                gridRef={gridRef}
              />
            </Stack>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Textarea label="Remarks" autosize minRows={3} value={h.notes || ""} readOnly={readOnly} onChange={(e) => setField("notes", e.currentTarget.value)} />
              <Textarea label="Internal Notes" autosize minRows={3} value={h.internal_notes || ""} readOnly={readOnly} onChange={(e) => setField("internal_notes", e.currentTarget.value)} />
            </SimpleGrid>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 3.4 }}>
          <Stack gap="lg" pos="sticky" top={16}>
            <Paper p="lg">
              <Title order={5} mb="md">Totals ({cur})</Title>
              <Stack gap={8}>
                <Group justify="space-between"><Text fz="sm">Subtotal</Text><Text fw={600} ff="monospace">{money(t.subtotal)}</Text></Group>
                <Group justify="space-between" wrap="nowrap">
                  <Group gap={6} wrap="nowrap">
                    <Text fz="sm">VAT</Text>
                    <NumberInput size="xs" w={64} value={h.vat_rate} min={0} max={100} decimalScale={2} suffix="%" hideControls readOnly={readOnly} onChange={(v) => setField("vat_rate", Number(v) || 0)} aria-label="VAT rate" />
                  </Group>
                  <Text ff="monospace">{money(t.vat)}</Text>
                </Group>
                <Divider my={4} />
                <Group justify="space-between"><Text fw={700} fz="lg">Total</Text><Text fw={700} fz="lg" ff="monospace">{money(t.total)}</Text></Group>
              </Stack>
              {t.missingRate > 0 && (
                <Text c="orange.7" fz="sm" mt="md"><IconAlertTriangle size={14} style={{ verticalAlign: -2 }} /> {t.missingRate} line{t.missingRate === 1 ? "" : "s"} without rate</Text>
              )}
            </Paper>

            {quote && (
              <Outcome
                quote={quote}
                readOnly={readOnly}
                beforeAction={async () => !dirty || !!(await save())}
                onChange={applyQuote}
              />
            )}

            <Workings quoteId={quote?.id ?? null} readOnly={readOnly} version={workingsVer} />

            {quote && quote.revisions.length > 1 && (
              <Paper p="lg">
                <Title order={5} mb="md">Revision History</Title>
                <Timeline active={quote.revisions.findIndex((r) => r.id === quote.id)} bulletSize={14} lineWidth={2}>
                  {quote.revisions.map((r) => (
                    <Timeline.Item key={r.id} title={r.id === quote.id ? <b>{quoteNo(quote.base_number, r.rev)}</b> : <Anchor component={Link} to={`/quotes/${r.id}`} fz="sm">{quoteNo(quote.base_number, r.rev)}</Anchor>}>
                      <Text fz="xs" c="dimmed">{dateFmt(r.quote_date)} · {money(r.total)}</Text>
                    </Timeline.Item>
                  ))}
                </Timeline>
              </Paper>
            )}

            {quote && quote.emails.length > 0 && (
              <Paper p="lg">
                <Title order={5} mb="md">Email Log</Title>
                <Stack gap="xs">
                  {quote.emails.map((m) => (
                    <div key={m.id}>
                      <Text fz="sm"><b>{m.created_at.slice(0, 16).replace("T", " ")}</b> · {m.sent_by || "—"} → {m.to_addr}</Text>
                      <Text fz="xs" c="dimmed">{m.subject}</Text>
                    </div>
                  ))}
                </Stack>
              </Paper>
            )}
          </Stack>
        </Grid.Col>
      </Grid>

      <Modal opened={!!reading} onClose={() => {}} withCloseButton={false} centered size="sm">
        <Stack gap="sm" py="xs">
          <Group gap="sm"><Loader size="sm" /><Text fw={600}>{reading?.label}</Text></Group>
          {reading?.pct != null && <Progress value={reading.pct} animated />}
        </Stack>
      </Modal>
      {paste && (
        <PastePreview
          input={paste.input}
          previews={paste.previews}
          ocr={paste.ocr}
          hasLines={lines.some((l) => !isBlank(l))}
          canInsert={paste.row != null && paste.row < lines.filter((l) => !isBlank(l)).length}
          enquiryEmpty={!h.enquiry_ref}
          onCancel={() => setPaste(null)}
          onConfirm={applyPaste}
        />
      )}
      {newCust !== null && (
        <CustomerForm
          initialName={newCust}
          onClose={() => setNewCust(null)}
          onSaved={(c) => {
            setCustomers((cs) => [...cs, c].sort((a, b) => a.name.localeCompare(b.name)));
            pickCustomer(c);
            setNewCust(null);
          }}
        />
      )}
      {emailOpen && quote && (
        <EmailDialog quote={quote} onClose={() => setEmailOpen(false)} onLogged={(q) => { applyQuote(q); setEmailOpen(false); }} onPrint={() => navigate(`/quotes/${quote.id}/print`)} />
      )}
    </Page>
  );
}
