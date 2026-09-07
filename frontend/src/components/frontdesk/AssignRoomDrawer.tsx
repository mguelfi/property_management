import { useMemo } from "react";
import {
  useFrontDeskActions,
  useReservation,
  useRoomTypeMap,
  useRooms,
  useUndoAction,
} from "../../api/hooks";
import { useAuth } from "../../auth/AuthContext";
import { RoomLineRow, type PendingUpgrade } from "../../pages/ReservationDetail";
import { useToast } from "../Toaster";
import { Drawer, ErrorText, Spinner } from "../ui";

export function AssignRoomDrawer({
  reservationId,
  onClose,
  pendingUpgrades,
  onPendingUpgrade,
}: {
  reservationId: number;
  onClose: () => void;
  /** Line id -> pending upgrade charge to include at check-in, lifted up to
   * FrontDeskBoard so it survives this drawer closing/reopening. */
  pendingUpgrades: Map<number, PendingUpgrade>;
  onPendingUpgrade: (lineId: number, upgrade: PendingUpgrade | null) => void;
}) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: res, isLoading, error } = useReservation(reservationId);
  const roomTypes = useRoomTypeMap();
  const allRooms = useRooms();
  const fd = useFrontDeskActions();
  const undo = useUndoAction();

  const roomNumbers = useMemo(
    () => new Map((allRooms.data ?? []).map((r) => [r.id, r.number])),
    [allRooms.data],
  );

  const canOperate = can("frontdesk.operate");
  const unassigned = res ? res.rooms.filter((r) => r.assigned_room_id === null).length : 0;
  const canAssign = canOperate && !!res && ["confirmed", "in_house"].includes(res.status);

  return (
    <Drawer title={res ? `Assign rooms — ${res.reference}` : "Assign rooms"} onClose={onClose}>
      {isLoading && <Spinner />}
      <ErrorText error={error} />
      {res && (
        <>
          {unassigned > 0 && canOperate && (
            <div className="btn-row" style={{ marginBottom: 12 }}>
              <button
                className="btn"
                onClick={() =>
                  fd.autoAssign.mutate(reservationId, {
                    onSuccess: () => toast.ok("Rooms assigned"),
                    onError: toast.error,
                  })
                }
              >
                Auto-assign {unassigned} room{unassigned > 1 ? "s" : ""}
              </button>
            </div>
          )}
          <p className="muted" style={{ fontSize: 12.5, marginTop: -4 }}>
            Picking a room of a different type or a better view offers a free or paid upgrade,
            charged at check-in.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Room type</th>
                  <th>Dates</th>
                  <th>Guests</th>
                  <th>Assigned room</th>
                  <th className="num-cell">Rate total</th>
                </tr>
              </thead>
              <tbody>
                {res.rooms.map((line) => (
                  <RoomLineRow
                    key={line.id}
                    line={line}
                    typeName={roomTypes.get(line.room_type_id)?.name ?? `Type ${line.room_type_id}`}
                    currency={res.currency}
                    roomNumbers={roomNumbers}
                    canAssign={canAssign}
                    allowUpgrade
                    reservationId={reservationId}
                    pendingUpgrade={pendingUpgrades.get(line.id) ?? null}
                    onPendingUpgrade={(upgrade) => onPendingUpgrade(line.id, upgrade)}
                    onAssign={(roomId, opts) =>
                      fd.assign.mutate(
                        {
                          reservationId,
                          lineId: line.id,
                          roomId,
                          allowTypeMismatch: opts?.allowTypeMismatch,
                        },
                        {
                          onSuccess: (data) => {
                            toast.ok(
                              line.assigned_room_id ? "Room changed" : "Room assigned",
                              data.audit_event_id
                                ? {
                                    label: "Undo",
                                    onClick: () =>
                                      undo.mutate(
                                        {
                                          auditEventId: data.audit_event_id!,
                                          reservationId,
                                        },
                                        { onError: toast.error },
                                      ),
                                  }
                                : undefined,
                            );
                            opts?.onAssigned?.();
                          },
                          onError: toast.error,
                        },
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Drawer>
  );
}
