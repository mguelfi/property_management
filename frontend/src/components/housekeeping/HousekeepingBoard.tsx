import { useState } from "react";
import { useFloors, useHousekeepingActions, useHousekeepingBoard } from "../../api/hooks";
import type { HousekeepingStatus, RoomHousekeepingRow } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { STATUS_LABEL, STATUS_OPTIONS } from "../../lib/housekeepingStatus";
import { useToast } from "../Toaster";
import { ErrorText, Field, Select, Spinner } from "../ui";

const STATUSES: HousekeepingStatus[] = ["clean", "dirty", "inspected", "out_of_service"];

/** Kanban presentation of room housekeeping status: one column per status,
 * cards movable via drag-and-drop or a "Move to…" select. Reuses the same
 * hooks/mutation as the standard table view. */
export function HousekeepingBoard() {
  const { can } = useAuth();
  const editable = can("housekeeping.manage");
  const toast = useToast();
  const [floor, setFloor] = useState("");
  const floors = useFloors();
  const board = useHousekeepingBoard({ floor: floor || undefined });
  const actions = useHousekeepingActions();
  const [dragRoomId, setDragRoomId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<HousekeepingStatus | null>(null);

  const rows = board.data ?? [];

  function setStatus(row: RoomHousekeepingRow, next: HousekeepingStatus) {
    if (next === row.status) return;
    actions.setStatus.mutate(
      { roomId: row.room_id, status: next },
      {
        onSuccess: () => toast.ok(`Room ${row.room_number} marked ${STATUS_LABEL[next]}`),
        onError: toast.error,
      },
    );
  }

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
        </div>
      </div>

      {board.isLoading && <Spinner />}
      <ErrorText error={board.error} />

      <div className="board">
        {STATUSES.map((status) => {
          const cards = rows.filter((r) => r.status === status);
          return (
            <div
              key={status}
              className={`board-column${dragOverStatus === status ? " drag-over" : ""}`}
              onDragOver={(e) => {
                if (!editable) return;
                e.preventDefault();
                setDragOverStatus(status);
              }}
              onDragLeave={() => setDragOverStatus((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStatus(null);
                if (!editable || dragRoomId == null) return;
                const row = rows.find((r) => r.room_id === dragRoomId);
                if (row) setStatus(row, status);
                setDragRoomId(null);
              }}
            >
              <div className="board-column-head">
                {STATUS_LABEL[status]}
                <span className="count">{cards.length}</span>
              </div>
              {cards.length === 0 && <div className="board-empty">No rooms.</div>}
              <div className="board-cards">
                {cards.map((r) => (
                  <div
                    key={r.room_id}
                    className="board-card"
                    draggable={editable}
                    onDragStart={() => setDragRoomId(r.room_id)}
                    onDragEnd={() => setDragRoomId(null)}
                  >
                    <div className="board-card-title">Room {r.room_number}</div>
                    <div className="board-card-meta">Floor {r.floor || "—"}</div>
                    {r.note && <div className="board-card-meta">{r.note}</div>}
                    {editable && (
                      <div className="board-card-actions">
                        <Select
                          value=""
                          onChange={(e) => {
                            const next = e.target.value as HousekeepingStatus;
                            if (next) setStatus(r, next);
                          }}
                          options={[["", "Move to…"], ...STATUS_OPTIONS.filter(([v]) => v !== r.status)]}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
