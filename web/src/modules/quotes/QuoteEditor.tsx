import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router";
import { api } from "../../lib/api";
import type { Customer, Quote, QuoteHeader } from "../../lib/types";
import { dateFmt, money, quoteNo, todayUAE } from "../../lib/format";
import { useApp } from "../../core/app-context";
import { CustomerForm } from "../../core/CustomerForm";
import { readSheetFile } from "../../lib/sheets";
import type { PasteInput } from "../../../../shared/paste-engine";
import { LineGrid, type GridApi } from "./LineGrid";
import { PastePreview, type PasteMode } from "./PastePreview";
import { blankLine, computeTotals, fromLines, fromParsed, isBlank, toLines, type EditLine } from "./lines";
import { CustomerPicker } from "./CustomerPicker";
import { Workings } from "./Workings";
import { EmailDialog } from "./EmailDialog";
import { StatusBadge } from "./status";
import { ActionIcon, Alert, Anchor, Badge, Button, Center, Divider, Grid, Group, Kbd, Loader, NumberInput, Paper, Select, SimpleGrid, Stack, Text, TextInput, Textarea, Timeline, Title, Tooltip, FileButton } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { modals } from "@mantine/modals";
import { IconAlertTriangle, IconArrowLeft, IconBan, IconCopy, IconDeviceFloppy, IconFileImport, IconGitBranch, IconLock, IconMail, IconPrinter, IconRefresh, IconTrash, IconUser } from "@tabler/icons-react";

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
  const [paste, setPaste] = useState<{ input: PasteInput; row: number | null } | null>(null);
  const [newCust, setNewCust] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const gridRef = useRef<GridApi | null>(null);
  const lastStructural = useRef(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const readOnly = !!quote?.superseded_by;
  const selectedCustomer = customers.find((c) => c.id === h.customer_id) || null;

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
    setPaste(null);
    const firstItem = next.findIndex((l, i) => i >= firstNew && l.kind === "item");
    setTimeout(() => gridRef.current?.focusCell(firstItem >= 0 ? firstItem : firstNew, "rate"), 30);
    const n = incoming.filter((l) => l.kind === "item").length;
    toast(`${n} line${n === 1 ? "" : "s"} added — enter the rates`);
  }

  async function onFile(file: File) {
    try {
      const rows = await readSheetFile(file);
      setPaste({ input: { rows }, row: null });
    } catch (e) {
      toast("Could not read the file: " + (e as Error).message, true);
    }
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
  const fromCust = (k: "payment_terms" | "validity" | "delivery_terms" | "vat_terms") =>
    !!selectedCustomer && !!h[k] && selectedCustomer[k] === h[k] ? <Badge size="xs" variant="light" color="stamp" ml={6} tt="none">from customer</Badge> : null;
  const latestRev = quote?.revisions[quote.revisions.length - 1];
  const nextRev = (latestRev?.rev ?? quote?.rev ?? 0) + 1;
  const cur = quote?.currency || cfg.currency;
  const term = (k: "payment_terms" | "validity" | "delivery_terms" | "vat_terms", label: string) => (
    <TextInput
      label={<>{label}{fromCust(k)}</>}
      value={h[k] || ""}
      readOnly={readOnly}
      onChange={(e) => setField(k, e.currentTarget.value)}
    />
  );

  return (
    <Stack gap="lg" pb={60}>
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Group gap="sm" align="center">
            <Title order={2} ff="heading">{quote ? quoteNo(quote.base_number, quote.rev) : "New quotation"}</Title>
            {quote && <StatusBadge s={quote.status} size="md" />}
            {readOnly && <Badge color="gray" leftSection={<IconLock size={12} />}>Read-only</Badge>}
          </Group>
          <Text c="dimmed" fz="sm" mt={4}>
            {quote ? `Created ${dateFmt(quote.created_at)} · last saved ${quote.updated_at.slice(11, 16)}` : "The number is given on first save"}
            {dirty && <Text span c="orange.7" fw={600}> · unsaved changes</Text>}
          </Text>
        </div>
        <Group gap="sm">
          <Button component={Link} to="/quotes" variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />}>All quotes</Button>
          {!readOnly && (
            <Button onClick={() => save()} loading={saving} leftSection={<IconDeviceFloppy size={16} />} rightSection={<Kbd size="xs">Ctrl+S</Kbd>}>
              Save
            </Button>
          )}
        </Group>
      </Group>

      {readOnly && latestRev && (
        <Alert color="orange" variant="light" icon={<IconLock size={18} />}>
          This revision was replaced and is kept read-only for the record.{" "}
          <Anchor component={Link} to={`/quotes/${latestRev.id}`} fw={600}>Open the latest revision →</Anchor>
        </Alert>
      )}

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 8.6 }}>
          <Stack gap="lg">
            <Paper p="lg">
              <Stack gap="md">
                <CustomerPicker
                  label="1 · Customer"
                  customers={customers}
                  value={h.customer_name}
                  selectedId={h.customer_id}
                  readOnly={readOnly}
                  onType={(v) => { setH((p) => ({ ...p, customer_name: v, customer_id: null })); setDirty(true); }}
                  onPick={pickCustomer}
                  onNew={(name) => setNewCust(name)}
                />
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                  <TextInput label="2 · Enquiry reference" placeholder="e.g. SSD2600032" value={h.enquiry_ref || ""} readOnly={readOnly} onChange={(e) => setField("enquiry_ref", e.currentTarget.value)} />
                  <Select
                    label="3 · Salesman"
                    placeholder="Choose"
                    leftSection={<IconUser size={16} />}
                    value={h.salesman_id ? String(h.salesman_id) : null}
                    readOnly={readOnly}
                    onChange={(v) => setField("salesman_id", v ? Number(v) : null)}
                    data={salesmen.filter((s) => s.active || s.id === h.salesman_id).map((s) => ({ value: String(s.id), label: s.name }))}
                  />
                  <DateInput label="Date" valueFormat="DD MMM YYYY" value={h.quote_date} readOnly={readOnly} onChange={(v) => v && setField("quote_date", String(v).slice(0, 10))} />
                </SimpleGrid>
                {h.customer_name && (
                  <>
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                      <Textarea label="Address (printed)" autosize minRows={2} value={h.customer_address || ""} readOnly={readOnly} onChange={(e) => setField("customer_address", e.currentTarget.value)} />
                      <TextInput label="Kind attention" value={h.attention || ""} readOnly={readOnly} onChange={(e) => setField("attention", e.currentTarget.value)} />
                    </SimpleGrid>
                    <Divider label="Terms" labelPosition="left" />
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                      {term("payment_terms", "Payment terms")}
                      {term("validity", "Quote validity")}
                      {term("delivery_terms", "Delivery terms")}
                      {term("vat_terms", "VAT terms")}
                    </SimpleGrid>
                  </>
                )}
              </Stack>
            </Paper>

            <Stack gap={8}>
              {!readOnly && (
                <Paper p="sm" className="no-print" bg="maroon.0" style={{ borderStyle: "dashed", borderColor: "var(--mantine-color-maroon-4)" }}>
                  <Group justify="space-between" gap="xs">
                    <Text fz="sm">
                      <Text span fw={700} c="maroon.7">4 · Paste items</Text> — copy cells in Excel or a list from an email, press <Kbd size="xs">Ctrl</Kbd>+<Kbd size="xs">V</Kbd> anywhere.{" "}
                      <Text span fw={700} c="maroon.7">5 · Enter rates</Text> — click a cell and type; <Kbd size="xs">Enter</Kbd> moves down.
                    </Text>
                    <FileButton onChange={(f) => f && onFile(f)} accept=".xlsx,.xls,.csv">
                      {(p) => <Button {...p} size="xs" variant="white" leftSection={<IconFileImport size={14} />}>Import .xlsx / .csv</Button>}
                    </FileButton>
                  </Group>
                </Paper>
              )}
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
              <Textarea label="Remarks" description="Printed on the quote" autosize minRows={3} value={h.notes || ""} readOnly={readOnly} onChange={(e) => setField("notes", e.currentTarget.value)} />
              <Textarea label="Internal notes" description="Never printed" autosize minRows={3} value={h.internal_notes || ""} readOnly={readOnly} onChange={(e) => setField("internal_notes", e.currentTarget.value)} />
            </SimpleGrid>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 3.4 }}>
          <Stack gap="md" pos="sticky" top={16}>
            <Paper p="lg">
              <Text fz="xs" tt="uppercase" fw={600} c="dimmed" ff="monospace" mb="sm">Totals ({cur})</Text>
              <Stack gap={6}>
                <Group justify="space-between"><Text fz="sm">Subtotal · {t.count} line{t.count === 1 ? "" : "s"}</Text><Text fw={700} ff="monospace">{money(t.subtotal)}</Text></Group>
                <Group justify="space-between" wrap="nowrap">
                  <Group gap={4} wrap="nowrap">
                    <Text fz="sm">VAT</Text>
                    <NumberInput size="xs" w={64} value={h.vat_rate} min={0} max={100} decimalScale={2} suffix="%" hideControls readOnly={readOnly} onChange={(v) => setField("vat_rate", Number(v) || 0)} />
                  </Group>
                  <Text ff="monospace">{money(t.vat)}</Text>
                </Group>
                <Divider my={4} />
                <Group justify="space-between"><Text fw={800} ff="heading" fz="xl">Total</Text><Text fw={800} ff="heading" fz="xl">{money(t.total)}</Text></Group>
              </Stack>
              {t.missingRate > 0 && (
                <Text c="orange.7" fz="sm" mt="sm"><IconAlertTriangle size={14} style={{ verticalAlign: -2 }} /> {t.missingRate} line{t.missingRate === 1 ? " has" : "s have"} no rate</Text>
              )}
            </Paper>

            <Paper p="md">
              <Stack gap="xs">
                <Button leftSection={<IconPrinter size={16} />} onClick={print} loading={saving}>Print / Save as PDF</Button>
                <Button variant="light" color="stamp" leftSection={<IconMail size={16} />} disabled={!quote}
                  onClick={async () => { if (dirty && !(await save())) return; setEmailOpen(true); }}>
                  Email via Outlook
                </Button>
                {quote && !readOnly && (
                  <Button variant="default" leftSection={<IconGitBranch size={16} />}
                    onClick={() => ask(`Create ${quoteNo(quote.base_number, nextRev)}?`, "The current version is kept read-only for the record.", "Create revision", () => act("/revise", undefined, "Revision created"))}>
                    Revise (REV {String(nextRev).padStart(2, "0")})
                  </Button>
                )}
                {quote && <Button variant="default" leftSection={<IconCopy size={16} />} onClick={() => act("/duplicate", undefined, "Copied to a new quote")}>Duplicate as new quote</Button>}
                {quote && !readOnly && (
                  <Group grow gap="xs">
                    {quote.status !== "cancelled" ? (
                      <Button variant="subtle" color="red" leftSection={<IconBan size={16} />}
                        onClick={() => ask("Mark as cancelled?", "It stays in the list but is left out of the Home totals.", "Mark cancelled", () => act("/status", { status: "cancelled" }, "Marked cancelled"), true)}>
                        Cancel quote
                      </Button>
                    ) : (
                      <Button variant="subtle" leftSection={<IconRefresh size={16} />} onClick={() => act("/status", { status: "draft" }, "Re-opened")}>Re-open</Button>
                    )}
                    {quote.status === "draft" && (
                      <Tooltip label="Delete this draft">
                        <ActionIcon variant="subtle" color="red" size="lg" style={{ flexGrow: 0 }} aria-label="Delete draft"
                          onClick={() => ask(`Delete ${quoteNo(quote.base_number, quote.rev)}?`, "This draft is deleted permanently.", "Delete", del, true)}>
                          <IconTrash size={18} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                )}
              </Stack>
            </Paper>

            <Workings quoteId={quote?.id ?? null} readOnly={readOnly} />

            {quote && quote.revisions.length > 1 && (
              <Paper p="md">
                <Title order={5} mb="sm">Revisions</Title>
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
              <Paper p="md">
                <Title order={5} mb="sm">Email log</Title>
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

      {paste && (
        <PastePreview
          input={paste.input}
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
    </Stack>
  );
}
