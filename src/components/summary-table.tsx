import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@/lib/dnd-modifiers";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLIENT_COLORS, formatDuration, type Client, type SummarySort, type SummarySortKey } from "@/lib/store";

export interface SummaryRow {
  client: Client;
  ms: number;
}

export function SummaryTable({
  rows,
  grandTotal,
  periodLabel,
  runningClientId,
  sort,
  onReorder,
  onSort,
}: {
  rows: SummaryRow[];
  grandTotal: number;
  periodLabel: string;
  runningClientId: string | null;
  /** Active column sort, or null when rows are in a manual (dragged) order. */
  sort: SummarySort | null;
  onReorder: (ids: string[]) => void;
  onSort: (sort: SummarySort) => void;
}) {
  function header(key: SummarySortKey, label: string, align: "left" | "right") {
    const active = sort?.key === key;
    const dir = active ? sort!.dir : null;
    // First click: names A–Z, numbers largest first; then toggle.
    const next: SummarySort = active
      ? { key, dir: dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "client" ? "asc" : "desc" };
    const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
    return (
      <th
        scope="col"
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
        className={cn("py-2 font-semibold", align === "right" && "text-right")}
      >
        <button
          type="button"
          onClick={() => onSort(next)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1 py-0.5 -mx-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            align === "right" && "flex-row-reverse",
          )}
        >
          {label}
          <Icon
            aria-hidden="true"
            className={cn("size-3.5", active ? "text-foreground" : "text-muted-foreground")}
          />
          <span className="sr-only">
            , sort {next.dir === "asc" ? "ascending" : "descending"}
          </span>
        </button>
      </th>
    );
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = rows.map((r) => r.client.id);

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }

  return (
    <div className="w-full min-w-0 flex-1 space-y-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
      >
        <table className="w-full text-sm">
          <caption className="sr-only">
            Time per client, {periodLabel}. Use the drag handles to reorder rows.
          </caption>
          <thead className="sticky top-0 z-20 bg-card">
            <tr className="border-b text-left">
              <th scope="col" className="w-8 py-2">
                <span className="sr-only">Reorder</span>
              </th>
              {header("client", "Client", "left")}
              {header("time", "Time", "right")}
              {header("share", "Share", "right")}
            </tr>
          </thead>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <SortableRow
                  key={r.client.id}
                  row={r}
                  grandTotal={grandTotal}
                  running={r.client.id === runningClientId}
                />
              ))}
            </tbody>
          </SortableContext>
          <tfoot>
            <tr className="border-t-2">
              <td />
              <th scope="row" className="py-2.5 text-left font-bold">Total</th>
              <td className="py-2.5 text-right font-mono font-bold tabular-nums">{formatDuration(grandTotal)}</td>
              <td className="py-2.5 text-right tabular-nums">{grandTotal > 0 ? "100%" : "—"}</td>
            </tr>
          </tfoot>
        </table>
      </DndContext>
    </div>
  );
}

function SortableRow({ row, grandTotal, running }: { row: SummaryRow; grandTotal: number; running: boolean }) {
  const { client, ms } = row;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: client.id });

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("bg-card", isDragging && "relative z-10 shadow-md ring-2 ring-ring")}
    >
      <td className="py-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder ${client.name}`}
          className="inline-flex size-7 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring active:cursor-grabbing"
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
      </td>
      <th scope="row" className="py-2.5 text-left font-medium">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-full"
            style={{ background: CLIENT_COLORS[client.color % CLIENT_COLORS.length] }}
          />
          {client.name}
          {running && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              Running
            </span>
          )}
        </span>
      </th>
      <td className="py-2.5 text-right font-mono tabular-nums">{formatDuration(ms)}</td>
      <td className="py-2.5 text-right tabular-nums">
        {grandTotal > 0 ? `${Math.round((ms / grandTotal) * 100)}%` : "—"}
      </td>
    </tr>
  );
}
