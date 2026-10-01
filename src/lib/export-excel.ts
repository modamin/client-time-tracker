import * as XLSX from "xlsx";
import type { Client, TimeEntry } from "@/lib/store";

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const durText = (ms: number) => {
  const mins = Math.round(ms / 60000);
  return `${Math.floor(mins / 60)}:${pad(mins % 60)}`;
};
/** Excel serial for the LOCAL calendar day of t (whole number). */
const excelDay = (t: number) => {
  const d = new Date(t);
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86_400_000);
};
/** Excel time-of-day fraction for the LOCAL time of t. */
const excelTime = (t: number) => {
  const d = new Date(t);
  return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86_400;
};
const hours = (ms: number) => Math.round((ms / 3_600_000) * 100) / 100;

/** Builds and downloads a workbook with "Time by client" and "Sessions" sheets. */
export function exportToExcel({
  clients,
  sessions,
  from,
  to,
  periodLabel,
}: {
  clients: Client[];
  /** Completed sessions overlapping the period. */
  sessions: TimeEntry[];
  /** Period start (epoch ms); time before it is excluded from totals. */
  from: number;
  /** Period end (epoch ms, exclusive); time after it is excluded. */
  to: number;
  periodLabel: string;
}) {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const sorted = [...sessions].sort((a, b) => a.start - b.start);

  const totals = new Map<string, number>();
  for (const e of sorted) {
    const ms = Math.min(e.end, to) - Math.max(e.start, from);
    totals.set(e.clientId, (totals.get(e.clientId) ?? 0) + ms);
  }
  const grand = [...totals.values()].reduce((a, b) => a + b, 0);

  const summaryRows = clients
    .map((c) => ({ c, ms: totals.get(c.id) ?? 0 }))
    .sort((a, b) => b.ms - a.ms)
    .map(({ c, ms }) => ({
      Client: c.name,
      Hours: hours(ms),
      "Duration (h:mm)": durText(ms),
      "Share %": grand > 0 ? Math.round((ms / grand) * 1000) / 10 : 0,
      Sessions: sorted.filter((e) => e.clientId === c.id).length,
    }));
  summaryRows.push({
    Client: "Total",
    Hours: hours(grand),
    "Duration (h:mm)": durText(grand),
    "Share %": grand > 0 ? 100 : 0,
    Sessions: sorted.length,
  });

  const sessionRows = sorted.map((e) => ({
    Date: excelDay(e.start),
    Client: byId.get(e.clientId)?.name ?? "Removed client",
    Description: e.note ?? "",
    Start: excelTime(e.start),
    End: excelTime(e.end),
    "Duration (h:mm)": durText(e.end - e.start),
    Hours: hours(e.end - e.start),
  }));

  const wb = XLSX.utils.book_new();

  const ws2 = XLSX.utils.json_to_sheet(sessionRows, {
    header: ["Date", "Client", "Description", "Start", "End", "Duration (h:mm)", "Hours"],
  });
  // Turn Date/Start/End into real Excel date and time cells.
  const fmt: Record<string, string> = { A: "yyyy-mm-dd", D: "hh:mm", E: "hh:mm" };
  for (let r = 0; r < sessionRows.length; r++) {
    for (const [col, z] of Object.entries(fmt)) {
      const cell = ws2[`${col}${r + 2}`] as XLSX.CellObject | undefined;
      if (cell) {
        cell.t = "n";
        cell.z = z;
      }
    }
  }
  ws2["!cols"] = [{ wch: 11 }, { wch: 24 }, { wch: 40 }, { wch: 7 }, { wch: 7 }, { wch: 15 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Sessions");

  // Summary sheet: the date range first, then the per-client table.
  const firstDay = sorted.length ? Math.min(...sorted.map((e) => e.start)) : Date.now();
  const rangeFrom = from > 0 ? from : firstDay;
  const rangeTo = Number.isFinite(to) ? to - 1 : Date.now();
  const ws1 = XLSX.utils.aoa_to_sheet([
    ["From", excelDay(rangeFrom)],
    ["To", excelDay(rangeTo)],
    [],
  ]);
  for (const ref of ["B1", "B2"]) {
    const cell = ws1[ref] as XLSX.CellObject;
    cell.t = "n";
    cell.z = "yyyy-mm-dd";
  }
  XLSX.utils.sheet_add_json(ws1, summaryRows, { origin: "A4" });
  ws1["!cols"] = [{ wch: 28 }, { wch: 11 }, { wch: 15 }, { wch: 9 }, { wch: 9 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Time by client");

  const data = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const slug = periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const fileName = `time-by-client-${slug}-${isoDate(Date.now())}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}
