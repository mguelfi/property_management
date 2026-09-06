import { useMemo, useState } from "react";
import { useHousekeepingBoard, useHousekeepingTaskActions, useHousekeepingTasks } from "../../api/hooks";
import type { HousekeepingTask, HousekeepingTaskStatus } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { TaskModal } from "../../pages/Housekeeping";
import { useToast } from "../Toaster";
import { ErrorText, Spinner } from "../ui";

const STATUSES: HousekeepingTaskStatus[] = ["open", "in_progress", "done"];
const STATUS_LABEL: Record<HousekeepingTaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

/** Kanban presentation of housekeeping tasks: Open / In progress / Done
 * columns, movable via drag-and-drop or the existing Start/Done buttons.
 * Reuses the same hooks/mutations as the standard table view. */
export function TasksBoard() {
  const { can } = useAuth();
  const editable = can("housekeeping.manage");
  const toast = useToast();
  const tasks = useHousekeepingTasks();
  const actions = useHousekeepingTaskActions();
  const board = useHousekeepingBoard({});
  const [creating, setCreating] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<HousekeepingTaskStatus | null>(null);

  const roomNumbers = useMemo(
    () => new Map((board.data ?? []).map((r) => [r.room_id, r.room_number])),
    [board.data],
  );

  const rows = tasks.data ?? [];

  function setStatus(task: HousekeepingTask, next: HousekeepingTaskStatus) {
    if (next === task.status) return;
    actions.update.mutate(
      { id: task.id, body: { status: next } },
      {
        onSuccess: () => {
          if (next === "done") toast.ok("Task done");
        },
        onError: toast.error,
      },
    );
  }

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

      {tasks.isLoading && <Spinner />}
      <ErrorText error={tasks.error} />

      <div className="board">
        {STATUSES.map((status) => {
          const cards = rows.filter((t) => t.status === status);
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
                if (!editable || dragTaskId == null) return;
                const task = rows.find((t) => t.id === dragTaskId);
                if (task) setStatus(task, status);
                setDragTaskId(null);
              }}
            >
              <div className="board-column-head">
                {STATUS_LABEL[status]}
                <span className="count">{cards.length}</span>
              </div>
              {cards.length === 0 && <div className="board-empty">No tasks.</div>}
              <div className="board-cards">
                {cards.map((t) => (
                  <div
                    key={t.id}
                    className="board-card"
                    draggable={editable}
                    onDragStart={() => setDragTaskId(t.id)}
                    onDragEnd={() => setDragTaskId(null)}
                  >
                    <div className="board-card-title">
                      Room {roomNumbers.get(t.room_id) ?? `#${t.room_id}`}
                    </div>
                    <div className="board-card-meta">{t.description || "—"}</div>
                    {editable && t.status !== "done" && (
                      <div className="board-card-actions">
                        {t.status === "open" && (
                          <button className="btn btn-sm" onClick={() => setStatus(t, "in_progress")}>
                            Start
                          </button>
                        )}
                        <button className="btn btn-sm btn-primary" onClick={() => setStatus(t, "done")}>
                          Done
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
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
