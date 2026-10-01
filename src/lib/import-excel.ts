import * as XLSX from "xlsx";

export interface ImportedSession {
  clientName: string;
  start: number;
  end: number;
  note?: string;
}

export interface ParseResult {
  sessions: ImportedSession[];
  /** Spreadsheet row numbers (1-based) that could not be read. */
  badRows: number[];
}

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 50_000;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Local-calendar [y, m, d] from an Excel date serial or "yyyy-mm-dd" text. */
function readDate(v: unknown): [number, number, number] | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(EXCEL_EPOCH + Math.floor(v) * 86_400_000);
    return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
  }
  if (typeof v === "string") {
    const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(v);
    if (m) return [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  }
  return null;
}

/** Seconds since midnight from an Excel time fraction or "hh:mm[:ss]" text. */
function readTime(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const frac = v - Math.floor(v);
    return Math.round(frac * 86_400) % 86_400;
  }
  if (typeof v === "string") {
    const m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(v);
    if (m) {
      const h = Number(m[1]);
      const mi = Number(m[2]);
      const s = Number(m[3] ?? 0);
      if (h < 24 && mi < 60 && s < 60) return h * 3600 + mi * 60 + s;
    }
  }
  return null;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Reads the "Sessions" sheet of a file created by Export to Excel. */
export async function parseBackup(file: File): Promise<ParseResult> {
  if (file.size > MAX_BYTES) throw new Error("That file is too large to import (10 MB maximum).");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const sheetName = wb.SheetNames.find((n) => norm(n) === "sessions");
  if (!sheetName) throw new Error("That file has no Sessions sheet. Choose a file made with Export to Excel.");
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  });
  if (grid.length === 0) throw new Error("The Sessions sheet is empty.");

  const header = (grid[0] ?? []).map(norm);
  const col = (name: string) => header.indexOf(name);
  const cDate = col("date");
  const cClient = col("client");
  const cDesc = col("description");
  const cStart = col("start");
  const cEnd = col("end");
  if ([cDate, cClient, cStart, cEnd].some((i) => i < 0)) {
    throw new Error("The Sessions sheet needs Date, Client, Start and End columns.");
  }
  if (grid.length - 1 > MAX_ROWS) throw new Error(`That file has more than ${MAX_ROWS} sessions.`);

  const sessions: ImportedSession[] = [];
  const badRows: number[] = [];
  for (let i = 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const date = readDate(row[cDate]);
    const startSec = readTime(row[cStart]);
    const endSec = readTime(row[cEnd]);
    const clientName = String(row[cClient] ?? "").trim().slice(0, 60);
    if (!date || startSec === null || endSec === null || !clientName) {
      badRows.push(i + 1);
      continue;
    }
    const [y, m, d] = date;
    const start = new Date(y, m, d, 0, 0, startSec).getTime();
    let end = new Date(y, m, d, 0, 0, endSec).getTime();
    if (end <= start) end = new Date(y, m, d + 1, 0, 0, endSec).getTime(); // ran past midnight
    const noteRaw = cDesc >= 0 ? String(row[cDesc] ?? "").trim().slice(0, 200) : "";
    sessions.push({ clientName, start, end, ...(noteRaw ? { note: noteRaw } : {}) });
  }
  return { sessions, badRows };
}
