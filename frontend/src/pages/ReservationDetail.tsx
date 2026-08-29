import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useFrontDeskActions,
  useReservation,
  useReservationAction,
  useRoomTypeMap,
  useRooms,
} from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { FolioPanel } from "../components/FolioPanel";
import { GuestName } from "../components/GuestName";
import { useToast } from "../components/Toaster";
import { EmptyState, ErrorText, Select, Spinner, StatusBadge } from "../components/ui";
import { fmtDate } from "../lib/dates";
import { formatMoney } from "../lib/money";
import type { RoomLine } from "../api/types";

export function ReservationDetail() {
  const { id } = useParams();
  const rid = Number(id);
  const { can } = useAuth();
  const toast = useToast();
  const { data: res, isLoading, error } = useReservation(rid);
  const roomTypes = useRoomTypeMap();
  const statusActions = useReservationAction(rid);
  const fd = useFrontDeskActions();

  const unassigned = useMemo(
    () => (res?.rooms ?? []).filter((r) => r.assigned_room_id === null).length,
    [res],
  );

  if (isLoading) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!res) return <EmptyState>Not found.</EmptyState>;

  const canManage = can("reservations.manage");
  const canOperate = can("frontdesk.operate");
  const showFolio = res.status === "in_house" || res.status === "checked_out" || !!res.checked_in_at;

  return (
    <>
      <div className="page-head">
        <h1>{res.reference}</h1>
        <StatusBadge status={res.status} />
        <div className="spacer" />
        <Link className="btn btn-sm" to="/reservations">
          All reservations
        </Link>
      </div>

      <div className="card">
        <div className="card-row">
          <div className="stat">
            <div className="lbl">Guest</div>
            <div>
              <GuestName id={res.primary_guest_id} />
            </div>
          </div>
          <div className="stat">
            <div className="lbl">Stay</div>
            <div>
              {fmtDate(res.arrival)} → {fmtDate(res.departure)}
            </div>
          </div>
          <div className="stat">
            <div className="lbl">Source</div>
            <div>
              {res.source}
              {res.channel_name ? ` · ${res.channel_name}` : ""}
            </div>
          </div>
          <div className="stat">
            <div className="lbl">Total</div>
            <div>{formatMoney(res.total_minor, res.currency)}</div>
          </div>
        </div>
        {res.cancellation_note && (
          <p className="muted" style={{ marginBottom: 0 }}>
            {res.cancellation_note}
            {res.free_cancel_until ? ` (free until ${fmtDate(res.free_cancel_until)})` : ""}
          </p>
        )}
      </div>

      <div className="card">
        <h2>Rooms</h2>
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
                  canAssign={canOperate && ["confirmed", "in_house"].includes(res.status)}
                  onAssign={(roomId) =>
                    fd.assign.mutate(
                      { reservationId: rid, lineId: line.id, roomId },
                      { onSuccess: () => toast.ok("Room assigned"), onError: toast.error },
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="btn-row" style={{ marginTop: 12 }}>
          {canManage && res.status === "inquiry" && (
            <button
              className="btn btn-primary"
              onClick={() =>
                statusActions.confirm.mutate(undefined, {
                  onSuccess: () => toast.ok("Confirmed"),
                  onError: toast.error,
                })
              }
            >
              Confirm
            </button>
          )}
          {canOperate && res.status === "confirmed" && unassigned > 0 && (
            <button
              className="btn"
              onClick={() =>
                fd.autoAssign.mutate(rid, {
                  onSuccess: () => toast.ok("Rooms assigned"),
                  onError: toast.error,
                })
              }
            >
              Auto-assign {unassigned} room{unassigned > 1 ? "s" : ""}
            </button>
          )}
          {canOperate && res.status === "confirmed" && (
            <button
              className="btn btn-primary"
              disabled={unassigned > 0}
              onClick={() =>
                fd.checkIn.mutate(rid, {
                  onSuccess: () => toast.ok("Checked in"),
                  onError: toast.error,
                })
              }
            >
              Check in
            </button>
          )}
          {canOperate && res.status === "in_house" && (
            <Link className="btn btn-primary" to="/frontdesk">
              Check out (Front desk)
            </Link>
          )}
          {canManage && ["inquiry", "confirmed"].includes(res.status) && (
            <button
              className="btn btn-danger"
              onClick={() => {
                const reason = prompt("Cancellation reason?") ?? "";
                statusActions.cancel.mutate(reason, {
                  onSuccess: () => toast.ok("Cancelled"),
                  onError: toast.error,
                });
              }}
            >
              Cancel
            </button>
          )}
          {canManage && res.status === "confirmed" && (
            <button
              className="btn"
              onClick={() =>
                statusActions.noShow.mutate(undefined, {
                  onSuccess: () => toast.ok("Marked no-show"),
                  onError: toast.error,
                })
              }
            >
              No-show
            </button>
          )}
        </div>
      </div>

      {showFolio && can("billing.view") && <FolioPanel reservationId={rid} />}
    </>
  );
}

function RoomLineRow({
  line,
  typeName,
  currency,
  canAssign,
  onAssign,
}: {
  line: RoomLine;
  typeName: string;
  currency: string;
  canAssign: boolean;
  onAssign: (roomId: number) => void;
}) {
  const rooms = useRooms(canAssign && line.assigned_room_id === null ? line.room_type_id : undefined);
  return (
    <tr>
      <td>{typeName}</td>
      <td>
        {fmtDate(line.arrival)} → {fmtDate(line.departure)}
      </td>
      <td>
        {line.adults}a{line.children ? ` ${line.children}c` : ""}
      </td>
      <td>
        {line.assigned_room_id !== null ? (
          `#${line.assigned_room_id}`
        ) : canAssign ? (
          <Select
            options={[
              ["", "— assign —"],
              ...(rooms.data ?? []).map((r) => [String(r.id), `Room ${r.number}`] as [string, string]),
            ]}
            defaultValue=""
            onChange={(e) => e.target.value && onAssign(Number(e.target.value))}
          />
        ) : (
          <span className="muted">unassigned</span>
        )}
      </td>
      <td className="num-cell">{formatMoney(line.rate_total_minor, currency)}</td>
    </tr>
  );
}
