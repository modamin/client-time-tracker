import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { FileSpreadsheet, Upload, Pencil, Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/hooks/use-confirm";
import { ClientToggle } from "@/components/client-toggle";
import { SummaryTable } from "@/components/summary-table";
import { exportToExcel } from "@/lib/export-excel";
import { parseBackup } from "@/lib/import-excel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CLIENT_COLORS,
  formatDuration,
  previewImport,
  useAppStore,
  type Client,
  type TimeEntry,
} from "@/lib/store";

type Period = "today" | "week" | "all" | "custom";
const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
/** Local date as yyyy-mm-dd (the native date input format). */
function toInputDate(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
/** Parses yyyy-mm-dd as local midnight; null when empty/invalid. */
function parseInputDate(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isNaN(t) ? null : t;
}
function startOfWeek(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.getTime();
}
const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

/** Returns [from, to) in epoch ms for the chosen period. */
function periodRange(
  period: Period,
  now: number,
  customFrom: string,
  customTo: string,
): { from: number; to: number; valid: boolean } {
  if (period === "all") return { from: 0, to: Infinity, valid: true };
  if (period === "custom") {
    const f = parseInputDate(customFrom);
    const t = parseInputDate(customTo);
    if (f === null || t === null || f > t) return { from: 0, to: 0, valid: false };
    const end = new Date(t);
    end.setDate(end.getDate() + 1);
    return { from: f, to: end.getTime(), valid: true };
  }
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return { from: period === "week" ? startOfWeek(now) : d.getTime(), to: Infinity, valid: true };
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), active ? 1000 : 30_000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });

export function HomePage() {
  const clients = useAppStore((s) => s.clients);
  const entries = useAppStore((s) => s.entries);
  const selectedClientId = useAppStore((s) => s.selectedClientId);
  const running = useAppStore((s) => s.running);
  const selectClient = useAppStore((s) => s.selectClient);
  const start = useAppStore((s) => s.start);
  const stop = useAppStore((s) => s.stop);
  const addClient = useAppStore((s) => s.addClient);
  const removeClient = useAppStore((s) => s.removeClient);
  const removeEntry = useAppStore((s) => s.removeEntry);
  const moveClient = useAppStore((s) => s.moveClient);
  const renameClient = useAppStore((s) => s.renameClient);
  const customOrder = useAppStore((s) => s.customOrder);
  const summaryOrder = useAppStore((s) => s.summaryOrder);
  const importSessions = useAppStore((s) => s.importSessions);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const setSummaryOrder = useAppStore((s) => s.setSummaryOrder);
  const summarySort = useAppStore((s) => s.summarySort);
  const setSummarySort = useAppStore((s) => s.setSummarySort);
  const sortClientsAlphabetically = useAppStore((s) => s.sortClientsAlphabetically);
  const note = useAppStore((s) => s.note);
  const setNote = useAppStore((s) => s.setNote);
  const updateEntryNote = useAppStore((s) => s.updateEntryNote);
  const confirm = useConfirm();

  const now = useNow(!!running);
  const [period, setPeriod] = useState<Period>("week");
  const [customFrom, setCustomFrom] = useState(() => toInputDate(startOfWeek(Date.now())));
  const [customTo, setCustomTo] = useState(() => toInputDate(Date.now()));

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const runningClient = running ? clientById.get(running.clientId) : undefined;
  const elapsed = running ? now - running.start : 0;

  // Entries in the selected period, including the live block.
  const { from, to, valid: rangeValid } = periodRange(period, now, customFrom, customTo);
  const periodEntries: TimeEntry[] = useMemo(() => {
    const list = entries.filter((e) => e.end > from && e.start < to);
    if (running && now > from && running.start < to)
      list.push({ id: "running", clientId: running.clientId, start: running.start, end: now });
    return list;
  }, [entries, from, to, running, now]);

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of periodEntries) {
      const dur = Math.min(e.end, to) - Math.max(e.start, from);
      map.set(e.clientId, (map.get(e.clientId) ?? 0) + dur);
    }
    const byTime = clients
      .map((c) => ({ client: c, ms: map.get(c.id) ?? 0 }))
      .sort((a, b) => b.ms - a.ms);
    if (!summaryOrder) {
      const sign = summarySort.dir === "asc" ? 1 : -1;
      if (summarySort.key === "client") {
        return [...byTime].sort(
          (a, b) => sign * a.client.name.localeCompare(b.client.name, undefined, { sensitivity: "base", numeric: true }),
        );
      }
      // Share is proportional to time, so both sort the same way.
      return [...byTime].sort((a, b) => sign * (a.ms - b.ms) || a.client.name.localeCompare(b.client.name));
    }
    // Manual order first; clients added since then follow, by time.
    const pos = new Map(summaryOrder.map((id, i) => [id, i]));
    return [...byTime].sort(
      (a, b) => (pos.get(a.client.id) ?? Infinity) - (pos.get(b.client.id) ?? Infinity),
    );
  }, [periodEntries, clients, from, to, summaryOrder, summarySort]);

  const periodLabel =
    period === "custom"
      ? rangeValid
        ? `${shortDate.format(from)} – ${shortDate.format(to - 1)}`
        : "Custom range"
      : PERIODS.find((p) => p.id === period)!.label;
  const rangeError =
    period === "custom" && !rangeValid
      ? !parseInputDate(customFrom) || !parseInputDate(customTo)
        ? "Choose both a start and an end date."
        : "The start date must be on or before the end date."
      : null;
  const grandTotal = totals.reduce((sum, t) => sum + t.ms, 0);

  function onAddClient(name: string): string | null {
    if (!name.trim()) return "Enter a client name.";
    return addClient(name) ? null : "That client already exists.";
  }

  function onExport() {
    if (rangeError) {
      toast.error(rangeError);
      return;
    }
    const slug =
      period === "custom" ? `${customFrom}-to-${customTo}` : PERIODS.find((p) => p.id === period)!.label;
    try {
      const fileName = exportToExcel({ clients, sessions, from, to, periodLabel: slug });
      toast.success(`Downloaded ${fileName}`);
    } catch {
      toast.error("Couldn't create the Excel file. Please try again.");
    }
  }

  async function onImportFile(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = ""; // allow choosing the same file again
    if (!file) return;
    setImporting(true);
    try {
      const { sessions: rows, badRows } = await parseBackup(file);
      if (rows.length === 0) {
        toast.error("No sessions could be read from that file.");
        return;
      }
      const preview = previewImport(clients, entries, rows);
      if (preview.imported === 0) {
        toast.info(`All ${rows.length} sessions in that file are already in the app.`);
        return;
      }
      const parts = [
        `${preview.imported} session${preview.imported === 1 ? "" : "s"} will be added.`,
        preview.duplicates ? `${preview.duplicates} already in the app will be skipped.` : "",
        preview.newClients.length
          ? `New client${preview.newClients.length === 1 ? "" : "s"}: ${preview.newClients.join(", ")}.`
          : "",
        badRows.length ? `${badRows.length} row${badRows.length === 1 ? "" : "s"} couldn't be read and will be skipped.` : "",
      ].filter(Boolean);
      const ok = await confirm({
        title: `Import from ${file.name}?`,
        description: parts.join(" "),
        confirmLabel: "Import",
      });
      if (!ok) return;
      const result = importSessions(rows);
      toast.success(
        `Imported ${result.imported} session${result.imported === 1 ? "" : "s"}` +
          (result.newClients.length ? ` and ${result.newClients.length} client${result.newClients.length === 1 ? "" : "s"}` : "") +
          ".",
      );
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Couldn't read that file.");
    } finally {
      setImporting(false);
    }
  }

  async function onRemoveClient(c: Client) {
    const ok = await confirm({
      title: `Remove ${c.name}?`,
      description: "All time logged for this client will be deleted.",
      confirmLabel: "Remove client",
      destructive: true,
    });
    if (ok) removeClient(c.id);
  }

  const sessions = periodEntries
    .filter((e) => e.id !== "running")
    .sort((a, b) => b.start - a.start);
  const sessionsByDay = useMemo(() => {
    const groups: { key: string; label: string; items: TimeEntry[] }[] = [];
    for (const e of sessions) {
      const key = new Date(e.start).toDateString();
      let g = groups.find((x) => x.key === key);
      if (!g) {
        g = { key, label: dayFmt.format(e.start), items: [] };
        groups.push(g);
      }
      g.items.push(e);
    }
    return groups;
  }, [sessions]);

  const selected = selectedClientId ? clientById.get(selectedClientId) : undefined;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8 lg:h-dvh">
      <h1 className="shrink-0 text-2xl font-bold tracking-tight md:text-3xl">Client Time Tracker</h1>

      <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        {/* Timer */}
        <section
          aria-labelledby="timer-heading"
          className="space-y-6 rounded-[var(--radius-2xl)] bg-gradient-to-br lg:min-h-0 lg:overflow-y-auto from-primary to-[oklch(0.3_0.08_150)] p-6 text-primary-foreground shadow-sm md:p-8"
        >
          <h2 id="timer-heading" className="sr-only">Timer</h2>

          <div className="space-y-1">
            <p className="text-sm font-medium opacity-90">
              {runningClient ? `Tracking ${runningClient.name}` : selected ? `Ready for ${selected.name}` : "Add a client to start"}
            </p>
            <p
              role="timer"
              aria-label={`Elapsed time ${formatDuration(elapsed)}`}
              className="font-mono text-6xl font-bold tabular-nums tracking-tight md:text-7xl"
            >
              {formatDuration(elapsed, true)}
            </p>
          </div>

          <div className="space-y-2">
            <ClientToggle
              clients={clients}
              selectedClientId={selectedClientId}
              onSelect={selectClient}
              onMove={moveClient}
              onAdd={onAddClient}
              onRename={renameClient}
              onRemove={onRemoveClient}
              runningClientId={running?.clientId ?? null}
              customOrder={customOrder}
              onSortAlphabetically={sortClientsAlphabetically}
            />
            {running && (
              <p className="text-xs opacity-90">Switching client logs the current block and keeps the timer running.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="session-note" className="text-sm font-semibold text-primary-foreground">
              Description <span className="font-normal opacity-90">(optional)</span>
            </Label>
            <Input
              id="session-note"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What are you working on?"
              className="rounded-full border-white/50 bg-white/10 text-primary-foreground placeholder:text-primary-foreground/75"
            />
          </div>


          {running ? (
            <Button
              type="button"
              onClick={stop}
              size="lg"
              className="h-14 w-full rounded-full bg-white text-base font-bold text-[oklch(0.3_0.08_150)] hover:bg-white/90"
            >
              <Square aria-hidden="true" className="fill-current" /> Stop timer
            </Button>
          ) : (
            <Button
              type="button"
              onClick={start}
              disabled={!selected}
              size="lg"
              className="h-14 w-full rounded-full bg-white text-base font-bold text-[oklch(0.3_0.08_150)] hover:bg-white/90"
            >
              <Play aria-hidden="true" className="fill-current" /> Start timer
            </Button>
          )}
        </section>

        <div className="flex flex-col gap-6 lg:min-h-0">
        {/* Summary */}
        <section
          aria-labelledby="summary-heading"
          className="flex flex-col gap-4 rounded-[var(--radius-2xl)] border bg-card p-5 md:p-6 lg:min-h-0 lg:flex-[1.1]"
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <h2 id="summary-heading" className="text-xl font-bold">Time by client</h2>
            <div role="group" aria-label="Period" className="inline-flex rounded-full bg-muted p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={period === p.id}
                  onClick={() => setPeriod(p.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    period === p.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-background",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {period === "custom" && (
            <fieldset className="shrink-0 space-y-2">
              <legend className="sr-only">Custom date range</legend>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="range-from" className="text-sm font-semibold">From</Label>
                  <Input
                    id="range-from"
                    type="date"
                    value={customFrom}
                    max={customTo || undefined}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    aria-invalid={!!rangeError}
                    aria-describedby={rangeError ? "range-error" : undefined}
                    className="w-auto"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="range-to" className="text-sm font-semibold">To</Label>
                  <Input
                    id="range-to"
                    type="date"
                    value={customTo}
                    min={customFrom || undefined}
                    onChange={(e) => setCustomTo(e.target.value)}
                    aria-invalid={!!rangeError}
                    aria-describedby={rangeError ? "range-error" : undefined}
                    className="w-auto"
                  />
                </div>
              </div>
              {rangeError && (
                <p id="range-error" role="alert" className="text-sm font-medium text-destructive">
                  {rangeError}
                </p>
              )}
            </fieldset>
          )}

          <div
            role="region"
            aria-label="Time by client results"
            tabIndex={0}
            className="-mx-2 flex max-h-[28rem] min-h-0 flex-col items-center gap-4 overflow-y-auto px-2 focus-visible:outline-2 focus-visible:outline-ring sm:flex-row sm:items-start lg:max-h-none lg:flex-1"
          >
          <Donut
            totals={totals}
            total={grandTotal}
            periodLabel={periodLabel}
            centerLabel={period === "custom" ? "Selected range" : periodLabel}
          />

          <SummaryTable
            rows={totals}
            grandTotal={grandTotal}
            periodLabel={periodLabel}
            runningClientId={running?.clientId ?? null}
            sort={summaryOrder ? null : summarySort}
            onReorder={setSummaryOrder}
            onSort={setSummarySort}
          />
          </div>
        </section>

      {/* Sessions */}
      <section
        aria-labelledby="sessions-heading"
        className="flex flex-col gap-4 rounded-[var(--radius-2xl)] border bg-card p-5 md:p-6 lg:min-h-0 lg:flex-1"
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <h2 id="sessions-heading" className="text-xl font-bold">Sessions</h2>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={onImportFile}
            />
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload aria-hidden="true" /> {importing ? "Importing…" : "Import from Excel"}
            </Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={onExport}>
              <FileSpreadsheet aria-hidden="true" /> Export to Excel
            </Button>
          </div>
        </div>
        {sessionsByDay.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions in this period yet.</p>
        ) : (
          <div
            role="region"
            aria-label="Session list"
            tabIndex={0}
            className="-mx-2 max-h-[28rem] min-h-0 space-y-5 overflow-y-auto px-2 focus-visible:outline-2 focus-visible:outline-ring lg:max-h-none lg:flex-1"
          >
            {sessionsByDay.map((g) => (
              <div key={g.key} className="space-y-2">
                <h3 className="sticky top-0 z-10 bg-card py-1 text-sm font-semibold text-muted-foreground">{g.label}</h3>
                <ul className="divide-y divide-border rounded-[var(--radius-lg)] border">
                  {g.items.map((e) => (
                    <SessionRow
                      key={e.id}
                      entry={e}
                      client={clientById.get(e.clientId)}
                      onSaveNote={(text) => updateEntryNote(e.id, text)}
                      onDelete={() => removeEntry(e.id)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
        </div>
      </div>
    </div>
  );
}

function Donut({
  totals,
  total,
  periodLabel,
  centerLabel,
}: {
  totals: { client: Client; ms: number }[];
  total: number;
  periodLabel: string;
  centerLabel: string;
}) {
  const r = 70;
  const circ = 2 * Math.PI * r;
  const segs = totals.filter((t) => t.ms > 0);
  let offset = 0;
  const summary =
    total > 0
      ? `${periodLabel}: ${formatDuration(total)} total. ` +
        segs.map((t) => `${t.client.name} ${formatDuration(t.ms)}`).join(", ") + "."
      : `${periodLabel}: no time logged.`;

  return (
    <figure className="flex shrink-0 flex-col items-center gap-2">
      <svg
        viewBox="0 0 200 200"
        className="size-40 shrink-0"
        role="img"
        aria-labelledby="donut-title donut-desc"
      >
        <title id="donut-title">Share of time by client</title>
        <desc id="donut-desc">{summary}</desc>
        <circle cx="100" cy="100" r={r} fill="none" stroke="var(--muted)" strokeWidth="26" />
        <g transform="rotate(-90 100 100)">
          {segs.map((t) => {
            const len = (t.ms / total) * circ;
            const el = (
              <circle
                key={t.client.id}
                cx="100"
                cy="100"
                r={r}
                fill="none"
                stroke={CLIENT_COLORS[t.client.color % CLIENT_COLORS.length]}
                strokeWidth="26"
                strokeDasharray={`${Math.max(len - 1.5, 0.5)} ${circ}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="100" y="98" textAnchor="middle" className="fill-foreground font-mono text-[22px] font-bold">
          {formatDuration(total)}
        </text>
        <text x="100" y="120" textAnchor="middle" className="fill-muted-foreground text-[11px] font-semibold">
          {centerLabel}
        </text>
      </svg>
      <figcaption className="text-sm font-medium">Share of time by client</figcaption>
    </figure>
  );
}

function SessionRow({
  entry,
  client,
  onSaveNote,
  onDelete,
}: {
  entry: TimeEntry;
  client: Client | undefined;
  onSaveNote: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.note ?? "");
  const name = client?.name ?? "Removed client";
  const at = timeFmt.format(entry.start);
  const inputId = `note-${entry.id}`;

  function begin() {
    setDraft(entry.note ?? "");
    setEditing(true);
  }
  function save(e?: FormEvent) {
    e?.preventDefault();
    onSaveNote(draft);
    setEditing(false);
  }

  return (
    <li className="flex items-start gap-3 px-4 py-2.5 text-sm">
      <span
        aria-hidden="true"
        className="mt-1.5 size-3 shrink-0 rounded-full"
        style={{ background: client ? CLIENT_COLORS[client.color % CLIENT_COLORS.length] : "var(--muted)" }}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate font-medium">{name}</p>
        {editing ? (
          <form onSubmit={save} className="flex flex-wrap items-center gap-2 pt-1">
            <label htmlFor={inputId} className="sr-only">
              Description for {name} session at {at}
            </label>
            <Input
              id={inputId}
              autoFocus
              value={draft}
              maxLength={200}
              onChange={(ev) => setDraft(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Escape") {
                  ev.preventDefault();
                  setEditing(false);
                }
              }}
              placeholder="Add a description"
              className="h-8 min-w-48 flex-1"
            />
            <Button type="submit" size="sm">Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </form>
        ) : entry.note ? (
          <p className="break-words text-muted-foreground">{entry.note}</p>
        ) : null}
      </div>
      <span className="pt-0.5 tabular-nums text-muted-foreground">
        {at} – {timeFmt.format(entry.end)}
      </span>
      <span className="w-20 pt-0.5 text-right font-mono font-semibold tabular-nums">
        {formatDuration(entry.end - entry.start)}
      </span>
      {!editing && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${entry.note ? "Edit" : "Add"} description for ${name} session at ${at}`}
          onClick={begin}
        >
          <Pencil aria-hidden="true" />
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${name} session at ${at}`}
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </li>
  );
}
