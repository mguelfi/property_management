import { useMemo, useState, type FormEvent } from "react";
import {
  useFloors,
  useHousekeepingActions,
  useHousekeepingBoard,
  useHousekeepingTaskActions,
  useHousekeepingTasks,
} from "../api/hooks";
import type { HousekeepingStatus, RoomHousekeepingRow } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { HousekeepingBoard } from "../components/housekeeping/HousekeepingBoard";
import { TasksBoard } from "../components/housekeeping/TasksBoard";
import { useToast } from "../components/Toaster";
import {
  EmptyState,
  ErrorText,
  Field,
  Modal,
  Select,
  Spinner,
  Tabs,
  Textarea,
} from "../components/ui";
import { STATUS_LABEL, STATUS_OPTIONS } from "../lib/housekeepingStatus";
import { useUITheme } from "../theme/UIThemeContext";

export function Housekeeping() {
  const { isDense } = useUITheme();
  const [tab, setTab] = useState("board");
  return (
    <>
      <div className="page-head">
        <h1>Housekeeping</h1>
      </div>
      <Tabs
        tabs={[
          ["board", "Room status"],
          ["tasks", "Tasks"],
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === "board" ? (
        isDense ? (
          <HousekeepingBoard />
        ) : (
          <BoardTab />
        )
      ) : isDense ? (
        <TasksBoard />
      ) : (
        <TasksTab />
      )}
    </>
  );
}

function groupByFloor(rows: RoomHousekeepingRow[]): [string, RoomHousekeepingRow[]][] {
  const m = new Map<string, RoomHousekeepingRow[]>();
  for (const r of rows) {
    const list = m.get(r.floor) ?? [];
    list.push(r);
    m.set(r.floor, list);
  }
  return [...m.entries()];
}

function BoardTab() {
  const { can } = useAuth();
  const editable = can("housekeeping.manage");
  const toast = useToast();
  const [floor, setFloor] = useState("");
  const [status, setStatus] = useState<HousekeepingStatus | "">("");
  const floors = useFloors();
  const board = useHousekeepingBoard({ floor: floor || undefined, status });
  const actions = useHousekeepingActions();

  const rows = board.data ?? [];

  return (
    <>
      <div className="card">
        <div className="form-row">
          <Field label="Floor">
            <Select
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              options={[["", "All floors"], ...(floors.data ?? []).map((f) => [f, f] as [string, string])]}
            />
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as HousekeepingStatus | "")}
              options={[["", "All statuses"], ...STATUS_OPTIONS]}
            />
          </Field>
        </div>
      </div>

      <div className="card">
        {board.isLoading && <Spinner />}
        <ErrorText error={board.error} />
        {rows.length === 0 && !board.isLoading && <EmptyState>No rooms.</EmptyState>}
        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Status</th>
                  <th>Note</th>
                  <th>Updated</th>
                  {editable && <th />}
                </tr>
              </thead>
              <tbody>
                {groupByFloor(rows).map(([fl, group]) => (
                  <FloorGroup
                    key={fl || "—"}
                    floor={fl}
                    rows={group}
                    editable={editable}
                    onSetStatus={(row, next) =>
                      actions.setStatus.mutate(
                        { roomId: row.room_id, status: next },
                        { onSuccess: () => toast.ok(`Room ${row.room_number} marked ${STATUS_LABEL[next]}`), onError: toast.error },
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function FloorGroup({
  floor,
  rows,
  editable,
  onSetStatus,
}: {
  floor: string;
  rows: RoomHousekeepingRow[];
  editable: boolean;
  onSetStatus: (row: RoomHousekeepingRow, next: HousekeepingStatus) => void;
}) {
  return (
    <>
      <tr className="group-row">
        <td colSpan={editable ? 5 : 4}>Floor {floor || "—"}</td>
      </tr>
      {rows.map((r) => (
        <tr key={r.room_id}>
          <td>{r.room_number}</td>
          <td>
            <span className={`badge badge-${r.status}`}>{STATUS_LABEL[r.status]}</span>
          </td>
          <td className="muted">{r.note || "—"}</td>
          <td className="muted">{r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}</td>
          {editable && (
            <td className="num-cell">
              <Select
                value=""
                onChange={(e) => {
                  const next = e.target.value as HousekeepingStatus;
                  if (next) onSetStatus(r, next);
                }}
                options={[["", "Set status…"], ...STATUS_OPTIONS.filter(([v]) => v !== r.status)]}
              />
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

function TasksTab() {
  const { can } = useAuth();
  const editable = can("housekeeping.manage");
  const toast = useToast();
  const tasks = useHousekeepingTasks();
  const actions = useHousekeepingTaskActions();
  const board = useHousekeepingBoard({});
  const [creating, setCreating] = useState(false);

  const roomNumbers = useMemo(
    () => new Map((board.data ?? []).map((r) => [r.room_id, r.room_number])),
    [board.data],
  );

  return (
    <>
      <div className="page-head">
        <h2>Tasks</h2>
        <div className="spacer" />
        {editable && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            New task
          </button>
        )}
      </div>

      <div className="card">
        {tasks.isLoading && <Spinner />}
        <ErrorText error={tasks.error} />
        {(tasks.data ?? []).length === 0 && !tasks.isLoading && <EmptyState>No tasks.</EmptyState>}
        {(tasks.data ?? []).length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Description</th>
                  <th>Status</th>
                  {editable && <th />}
                </tr>
              </thead>
              <tbody>
                {(tasks.data ?? []).map((t) => (
                  <tr key={t.id}>
                    <td>{roomNumbers.get(t.room_id) ?? `#${t.room_id}`}</td>
                    <td>{t.description || "—"}</td>
                    <td>
                      <span className={`badge badge-${t.status}`}>{t.status.replace("_", " ")}</span>
                    </td>
                    {editable && (
                      <td className="num-cell">
                        {t.status !== "done" && (
                          <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                            {t.status === "open" && (
                              <button
                                className="btn btn-sm"
                                onClick={() =>
                                  actions.update.mutate(
                                    { id: t.id, body: { status: "in_progress" } },
                                    { onError: toast.error },
                                  )
                                }
                              >
                                Start
                              </button>
                            )}
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() =>
                                actions.update.mutate(
                                  { id: t.id, body: { status: "done" } },
                                  { onSuccess: () => toast.ok("Task done"), onError: toast.error },
                                )
                              }
                            >
                              Done
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <TaskModal
          rooms={board.data ?? []}
          busy={actions.create.isPending}
          onClose={() => setCreating(false)}
          onSubmit={(body) =>
            actions.create.mutate(body, {
              onSuccess: () => {
                toast.ok("Task created");
                setCreating(false);
              },
              onError: toast.error,
            })
          }
        />
      )}
    </>
  );
}

export function TaskModal({
  rooms,
  busy,
  onClose,
  onSubmit,
}: {
  rooms: RoomHousekeepingRow[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [roomId, setRoomId] = useState(rooms[0]?.room_id ?? 0);
  const [description, setDescription] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ room_id: roomId, description });
  }

  return (
    <Modal title="New task" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Room">
          <Select
            value={String(roomId)}
            onChange={(e) => setRoomId(Number(e.target.value))}
            options={rooms.map((r) => [String(r.room_id), `${r.room_number}`] as [string, string])}
          />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <button className="btn btn-primary" disabled={busy || !roomId}>
          {busy ? "Saving…" : "Create task"}
        </button>
      </form>
    </Modal>
  );
}

