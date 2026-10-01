import { create } from "zustand";
import type { ImportedSession } from "@/lib/import-excel";

export interface Client {
  id: string;
  name: string;
  color: number; // index into CLIENT_COLORS
}

export interface TimeEntry {
  id: string;
  clientId: string;
  start: number; // epoch ms
  end: number; // epoch ms
  note?: string;
}

export interface RunningTimer {
  clientId: string;
  start: number;
}

export const CLIENT_COLORS = [
  "var(--chart-3)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-1)",
  "var(--chart-5)",
];

const HOUR = 3_600_000;
const MIN = 60_000;

function seed(): { clients: Client[]; entries: TimeEntry[] } {
  const clients: Client[] = [
    { id: "c-northwind", name: "Northwind Traders", color: 0 },
    { id: "c-contoso", name: "Contoso Health", color: 1 },
    { id: "c-fabrikam", name: "Fabrikam Logistics", color: 2 },
    { id: "c-internal", name: "Internal", color: 3 },
  ];
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const d = (daysAgo: number, h: number, m = 0) =>
    day.getTime() - daysAgo * 24 * HOUR + h * HOUR + m * MIN;
  const raw: [string, number, number, number, number, string?][] = [
    // clientId, daysAgo, startHour, startMin, durationMin, note
    ["c-northwind", 0, 8, 30, 95, "Lakehouse design review"],
    ["c-internal", 0, 10, 15, 40, "Expense report"],
    ["c-contoso", 1, 9, 0, 150, "Data migration workshop"],
    ["c-fabrikam", 1, 13, 0, 80],
    ["c-northwind", 1, 14, 45, 60, "Follow-up email and notes"],
    ["c-contoso", 2, 8, 45, 210, "Capacity sizing for F64"],
    ["c-internal", 2, 13, 30, 45],
    ["c-fabrikam", 3, 9, 30, 120, "Architecture diagram"],
    ["c-northwind", 3, 13, 0, 135],
    ["c-contoso", 4, 10, 0, 90, "Weekly sync"],
    ["c-internal", 4, 15, 0, 30],
  ];
  const entries: TimeEntry[] = raw.map(([clientId, ago, h, m, dur, note], i) => {
    const start = d(ago, h, m);
    return { id: `seed-${i}`, clientId, start, end: start + dur * MIN, ...(note ? { note } : {}) };
  });
  return { clients, entries };
}

// Storage can be unavailable in sandboxed previews — degrade to memory only.
const STORAGE_KEY = "client-time-tracker";
type Saved = Pick<AppState, "clients" | "entries" | "selectedClientId" | "running" | "note" | "customOrder" | "summaryOrder" | "summarySort">;

function loadSaved(): Partial<Saved> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Saved>;
    if (!Array.isArray(parsed.clients) || !Array.isArray(parsed.entries)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function save(state: Saved) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* in-memory only */
  }
}

export type SummarySortKey = "client" | "time" | "share";
export interface SummarySort {
  key: SummarySortKey;
  dir: "asc" | "desc";
}

export interface ImportSummary {
  imported: number;
  duplicates: number;
  newClients: string[];
}

/** Matches sessions at whole-second precision (exports drop milliseconds). */
export function sessionKey(clientId: string, start: number, end: number): string {
  return `${clientId}|${Math.floor(start / 1000)}|${Math.floor(end / 1000)}`;
}

/** Preview of what an import would do, without changing anything. */
export function previewImport(clients: Client[], entries: TimeEntry[], rows: ImportedSession[]): ImportSummary {
  const byName = new Map(clients.map((c) => [c.name.toLowerCase(), c.id]));
  const seen = new Set(entries.map((e) => sessionKey(e.clientId, e.start, e.end)));
  const newClients: string[] = [];
  let imported = 0;
  let duplicates = 0;
  for (const r of rows) {
    const lower = r.clientName.toLowerCase();
    let id = byName.get(lower);
    if (!id) {
      id = `new:${lower}`;
      byName.set(lower, id);
      newClients.push(r.clientName);
    }
    const key = sessionKey(id, r.start, r.end);
    if (seen.has(key)) duplicates++;
    else {
      seen.add(key);
      imported++;
    }
  }
  return { imported, duplicates, newClients };
}

interface AppState {
  clients: Client[];
  entries: TimeEntry[];
  selectedClientId: string | null;
  running: RunningTimer | null;
  /** Description for the current/next timed block. */
  note: string;
  /** False = clients kept in alphabetical order; true after a manual reorder. */
  customOrder: boolean;
  /** Manual row order for "Time by client"; null = sort by time. */
  summaryOrder: string[] | null;
  setSummaryOrder: (ids: string[] | null) => void;
  /** Column sort for "Time by client" (used when there is no manual order). */
  summarySort: SummarySort;
  setSummarySort: (sort: SummarySort) => void;
  importSessions: (rows: ImportedSession[]) => ImportSummary;
  sortClientsAlphabetically: () => void;
  setNote: (note: string) => void;
  updateEntryNote: (id: string, note: string) => void;
  selectClient: (id: string) => void;
  start: () => void;
  stop: () => void;
  addClient: (name: string) => string | null;
  removeClient: (id: string) => void;
  removeEntry: (id: string) => void;
  moveClient: (id: string, toIndex: number) => void;
  /** Returns an error message, or null on success. */
  renameClient: (id: string, name: string) => string | null;
}

const MIN_ENTRY_MS = 1000;

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
export function sortByName(clients: Client[]): Client[] {
  return [...clients].sort((a, b) => collator.compare(a.name, b.name));
}

function makeEntry(clientId: string, start: number, end: number, note: string): TimeEntry {
  const trimmed = note.trim();
  return { id: crypto.randomUUID(), clientId, start, end, ...(trimmed ? { note: trimmed } : {}) };
}

export const useAppStore = create<AppState>()(
    (set, get) => {
      const s = seed();
      const saved = loadSaved();
      return {
        customOrder: saved.customOrder === true,
        summaryOrder: Array.isArray(saved.summaryOrder) ? saved.summaryOrder : null,
        setSummaryOrder: (ids) => set({ summaryOrder: ids }),
        summarySort:
          saved.summarySort &&
          ["client", "time", "share"].includes(saved.summarySort.key) &&
          ["asc", "desc"].includes(saved.summarySort.dir)
            ? saved.summarySort
            : { key: "time", dir: "desc" },
        // Choosing a column sort replaces any manual drag order.
        setSummarySort: (sort) => set({ summarySort: sort, summaryOrder: null }),

        importSessions: (rows) => {
          const st = get();
          const clients = [...st.clients];
          const byName = new Map(clients.map((c) => [c.name.toLowerCase(), c.id]));
          const seen = new Set(st.entries.map((e) => sessionKey(e.clientId, e.start, e.end)));
          const added: TimeEntry[] = [];
          const newClients: string[] = [];
          let duplicates = 0;
          for (const r of rows) {
            const lower = r.clientName.toLowerCase();
            let id = byName.get(lower);
            if (!id) {
              const used = new Set(clients.map((c) => c.color));
              let color = clients.length % CLIENT_COLORS.length;
              for (let i = 0; i < CLIENT_COLORS.length; i++) if (!used.has(i)) { color = i; break; }
              id = crypto.randomUUID();
              clients.push({ id, name: r.clientName, color });
              byName.set(lower, id);
              newClients.push(r.clientName);
            }
            const key = sessionKey(id, r.start, r.end);
            if (seen.has(key)) {
              duplicates++;
              continue;
            }
            seen.add(key);
            added.push({ id: crypto.randomUUID(), clientId: id, start: r.start, end: r.end, ...(r.note ? { note: r.note } : {}) });
          }
          set({
            clients: st.customOrder ? clients : sortByName(clients),
            entries: [...st.entries, ...added],
            selectedClientId: st.selectedClientId ?? clients[0]?.id ?? null,
          });
          return { imported: added.length, duplicates, newClients };
        },
        clients:
          saved.customOrder === true && saved.clients ? saved.clients : sortByName(saved.clients ?? s.clients),
        entries: saved.entries ?? s.entries,
        selectedClientId: saved.selectedClientId ?? sortByName(s.clients)[0].id,
        running: saved.running ?? null,
        note: typeof saved.note === "string" ? saved.note : "",

        setNote: (note) => set({ note }),

        sortClientsAlphabetically: () => set((st) => ({ clients: sortByName(st.clients), customOrder: false })),

        updateEntryNote: (id, note) =>
          set((st) => ({
            entries: st.entries.map((e) => {
              if (e.id !== id) return e;
              const trimmed = note.trim();
              const next = { ...e };
              if (trimmed) next.note = trimmed;
              else delete next.note;
              return next;
            }),
          })),

        // Toggling client while the timer runs closes the current block and
        // starts a new one for the newly selected client.
        selectClient: (id) => {
          const { running } = get();
          if (running && running.clientId !== id) {
            const now = Date.now();
            set((st) => ({
              entries:
                now - running.start >= MIN_ENTRY_MS
                  ? [...st.entries, makeEntry(running.clientId, running.start, now, st.note)]
                  : st.entries,
              running: { clientId: id, start: now },
              selectedClientId: id,
              note: "",
            }));
          } else {
            set({ selectedClientId: id });
          }
        },

        start: () => {
          const { selectedClientId, running } = get();
          if (!selectedClientId || running) return;
          set({ running: { clientId: selectedClientId, start: Date.now() } });
        },

        stop: () => {
          const { running } = get();
          if (!running) return;
          const now = Date.now();
          set((st) => ({
            running: null,
            note: "",
            entries:
              now - running.start >= MIN_ENTRY_MS
                ? [...st.entries, makeEntry(running.clientId, running.start, now, st.note)]
                : st.entries,
          }));
        },

        addClient: (name) => {
          const trimmed = name.trim();
          if (!trimmed) return null;
          const { clients } = get();
          if (clients.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return null;
          const id = crypto.randomUUID();
          const used = new Set(clients.map((c) => c.color));
          let color = clients.length % CLIENT_COLORS.length;
          for (let i = 0; i < CLIENT_COLORS.length; i++) if (!used.has(i)) { color = i; break; }
          set((st) => ({
            clients: st.customOrder
              ? [...st.clients, { id, name: trimmed, color }]
              : sortByName([...st.clients, { id, name: trimmed, color }]),
            selectedClientId: st.running ? st.selectedClientId : id,
          }));
          return id;
        },

        removeClient: (id) =>
          set((st) => {
            if (st.running?.clientId === id) return st;
            const clients = st.clients.filter((c) => c.id !== id);
            return {
              clients,
              entries: st.entries.filter((e) => e.clientId !== id),
              selectedClientId: st.selectedClientId === id ? (clients[0]?.id ?? null) : st.selectedClientId,
            };
          }),

        removeEntry: (id) => set((st) => ({ entries: st.entries.filter((e) => e.id !== id) })),

        renameClient: (id, name) => {
          const trimmed = name.trim();
          if (!trimmed) return "Enter a client name.";
          const { clients } = get();
          if (clients.some((c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase()))
            return "Another client already has that name.";
          set((st) => {
            const renamed = st.clients.map((c) => (c.id === id ? { ...c, name: trimmed } : c));
            return { clients: st.customOrder ? renamed : sortByName(renamed) };
          });
          return null;
        },

        moveClient: (id, toIndex) =>
          set((st) => {
            const from = st.clients.findIndex((c) => c.id === id);
            if (from < 0) return st;
            const to = Math.max(0, Math.min(st.clients.length - 1, toIndex));
            if (from === to) return st;
            const clients = [...st.clients];
            const [moved] = clients.splice(from, 1);
            clients.splice(to, 0, moved);
            return { clients, customOrder: true };
          }),
      };
    },
);

useAppStore.subscribe((st) =>
  save({
    clients: st.clients,
    entries: st.entries,
    selectedClientId: st.selectedClientId,
    running: st.running,
    note: st.note,
    customOrder: st.customOrder,
    summaryOrder: st.summaryOrder,
    summarySort: st.summarySort,
  }),
);

export function formatDuration(ms: number, withSeconds = false): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (withSeconds) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
