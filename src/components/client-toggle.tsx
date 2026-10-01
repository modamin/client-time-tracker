import { useState, type FormEvent } from "react";
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, ArrowRight, Check, GripVertical, ArrowLeftRight, Plus, X, Pencil, Trash2, ArrowDownAZ } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLIENT_COLORS, type Client } from "@/lib/store";

const DARK_TEXT = "text-[oklch(0.3_0.08_150)]";

function Dot({ client }: { client: Client }) {
  return (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full ring-1 ring-black/20"
      style={{ background: CLIENT_COLORS[client.color % CLIENT_COLORS.length] }}
    />
  );
}

export function ClientToggle({
  clients,
  selectedClientId,
  onSelect,
  onMove,
  onAdd,
  onRename,
  onRemove,
  runningClientId,
  customOrder,
  onSortAlphabetically,
}: {
  clients: Client[];
  selectedClientId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
  /** Returns an error message, or null on success. */
  onAdd: (name: string) => string | null;
  /** Returns an error message, or null on success. */
  onRename: (id: string, name: string) => string | null;
  onRemove: (client: Client) => void;
  runningClientId: string | null;
  customOrder: boolean;
  onSortAlphabetically: () => void;
}) {
  const [arranging, setArranging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function closeAdd() {
    setAdding(false);
    setName("");
    setError(null);
  }
  function submitAdd(e: FormEvent) {
    e.preventDefault();
    const err = onAdd(name);
    if (err) setError(err);
    else closeAdd();
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const to = clients.findIndex((c) => c.id === over.id);
    if (to >= 0) onMove(String(active.id), to);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="client-toggle-label" className="text-sm font-semibold">Client</h3>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {arranging && customOrder && (
            <button type="button" onClick={onSortAlphabetically} className="inline-flex items-center gap-1.5 rounded-full border border-white/50 px-3 py-1 text-xs font-semibold hover:border-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <ArrowDownAZ aria-hidden="true" className="size-3.5" />
              Sort A–Z
            </button>
          )}
          {arranging || editing ? (
            <button
              type="button"
              onClick={() => {
                setArranging(false);
                setEditing(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/50 px-3 py-1 text-xs font-semibold hover:border-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Check aria-hidden="true" className="size-3.5" />
              Done
            </button>
          ) : (
            <>
              {!adding && (
                <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-full border border-white/50 px-3 py-1 text-xs font-semibold hover:border-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  <Plus aria-hidden="true" className="size-3.5" />
                  Add client
                </button>
              )}
              {clients.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    closeAdd();
                    setEditing(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/50 px-3 py-1 text-xs font-semibold hover:border-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <Pencil aria-hidden="true" className="size-3.5" />
                  Edit
                </button>
              )}
              {clients.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    closeAdd();
                    setArranging(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/50 px-3 py-1 text-xs font-semibold hover:border-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <ArrowLeftRight aria-hidden="true" className="size-3.5" />
                  Reorder
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {adding && (
        <form id="add-client-form" onSubmit={submitAdd} noValidate className="space-y-1.5">
          <label htmlFor="new-client" className="sr-only">New client name</label>
          <div className="flex gap-2">
            <input
              id="new-client"
              autoFocus
              value={name}
              maxLength={60}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  closeAdd();
                }
              }}
              aria-invalid={!!error}
              aria-describedby={error ? "new-client-error" : undefined}
              placeholder="Client name"
              className="h-9 min-w-0 flex-1 rounded-full border border-white/50 bg-white/10 px-4 text-sm text-primary-foreground placeholder:text-primary-foreground/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            />
            <button
              type="submit"
              className={cn("h-9 rounded-full bg-white px-4 text-sm font-semibold hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white", DARK_TEXT)}
            >
              Add
            </button>
            <button
              type="button"
              aria-label="Cancel adding client"
              onClick={closeAdd}
              className="inline-flex size-9 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
          {error && (
            <p id="new-client-error" role="alert" className="text-sm font-medium">
              {error}
            </p>
          )}
        </form>
      )}

      {editing ? (
        <ul aria-labelledby="client-toggle-label" className="space-y-2">
          {clients.map((c) => (
            <EditableClient
              key={c.id}
              client={c}
              isRunning={c.id === runningClientId}
              onRename={onRename}
              onRemove={onRemove}
            />
          ))}
        </ul>
      ) : arranging ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={clients.map((c) => c.id)} strategy={rectSortingStrategy}>
            <ul aria-labelledby="client-toggle-label" className="flex flex-wrap gap-2">
              {clients.map((c, i) => (
                <SortablePill
                  key={c.id}
                  client={c}
                  index={i}
                  count={clients.length}
                  onMove={onMove}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <div role="group" aria-labelledby="client-toggle-label" className="flex flex-wrap gap-2">
          {clients.map((c) => {
            const isOn = c.id === selectedClientId;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={isOn}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                  "forced-colors:border-[ButtonText]",
                  isOn
                    ? cn("border-white bg-white", DARK_TEXT)
                    : "border-white/50 bg-transparent text-primary-foreground hover:border-white hover:bg-white/10",
                )}
              >
                <Dot client={c} />
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SortablePill({
  client,
  index,
  count,
  onMove,
}: {
  client: Client;
  index: number;
  count: number;
  onMove: (id: string, toIndex: number) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: client.id });

  const iconBtn =
    "inline-flex size-7 items-center justify-center rounded-full hover:bg-black/10 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current";

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border-2 border-dashed border-white bg-white py-1 pr-1 pl-1 text-sm font-semibold",
        DARK_TEXT,
        "forced-colors:border-[ButtonText]",
        isDragging && "relative z-10 shadow-lg ring-2 ring-white",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${client.name}`}
        className={cn(iconBtn, "cursor-grab touch-none active:cursor-grabbing")}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
      <Dot client={client} />
      <span className="px-1">{client.name}</span>
      <button
        type="button"
        aria-label={`Move ${client.name} earlier`}
        disabled={index === 0}
        onClick={() => onMove(client.id, index - 1)}
        className={iconBtn}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        aria-label={`Move ${client.name} later`}
        disabled={index === count - 1}
        onClick={() => onMove(client.id, index + 1)}
        className={iconBtn}
      >
        <ArrowRight aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}

function EditableClient({
  client,
  isRunning,
  onRename,
  onRemove,
}: {
  client: Client;
  isRunning: boolean;
  onRename: (id: string, name: string) => string | null;
  onRemove: (client: Client) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(client.name);
  const [error, setError] = useState<string | null>(null);
  const inputId = `rename-${client.id}`;
  const errorId = `rename-error-${client.id}`;

  function cancel() {
    setRenaming(false);
    setDraft(client.name);
    setError(null);
  }
  function save(e: FormEvent) {
    e.preventDefault();
    const err = onRename(client.id, draft);
    if (err) setError(err);
    else {
      setRenaming(false);
      setError(null);
    }
  }

  const iconBtn =
    "inline-flex size-8 items-center justify-center rounded-full hover:bg-black/10 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current";

  return (
    <li className={cn("rounded-[var(--radius-lg)] bg-white px-3 py-2 text-sm", DARK_TEXT)}>
      {renaming ? (
        <form onSubmit={save} noValidate className="space-y-1">
          <div className="flex items-center gap-2">
            <Dot client={client} />
            <label htmlFor={inputId} className="sr-only">Client name</label>
            <input
              id={inputId}
              autoFocus
              value={draft}
              maxLength={60}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancel();
                }
              }}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              className="h-8 min-w-0 flex-1 rounded-full border border-current/40 bg-transparent px-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
            />
            <button
              type="submit"
              className="h-8 rounded-full bg-[oklch(0.3_0.08_150)] px-3 text-xs font-semibold text-white hover:bg-[oklch(0.25_0.07_150)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
            >
              Save
            </button>
            <button type="button" aria-label={`Cancel renaming ${client.name}`} onClick={cancel} className={iconBtn}>
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
          {error && (
            <p id={errorId} role="alert" className="pl-5 text-xs font-semibold text-[oklch(0.45_0.17_25)]">
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <Dot client={client} />
          <span className="min-w-0 flex-1 truncate font-semibold">{client.name}</span>
          {isRunning && <span className="text-xs font-medium">Timer running</span>}
          <button
            type="button"
            aria-label={`Rename ${client.name}`}
            onClick={() => {
              setDraft(client.name);
              setRenaming(true);
            }}
            className={iconBtn}
          >
            <Pencil aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            aria-label={isRunning ? `Stop the timer to remove ${client.name}` : `Remove ${client.name}`}
            disabled={isRunning}
            onClick={() => onRemove(client)}
            className={iconBtn}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </li>
  );
}
