import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useAmendReservation,
  useCompanies,
  useFrontDeskActions,
  useReservation,
  useReservationAction,
  useRoomTypeMap,
  useRoomViews,
  useRooms,
  useUndoAction,
  useUpgradeQuote,
} from "../api/hooks";
import type { Room } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { AmendRoomsModal } from "../components/AmendRoomsModal";
import { FolioPanel } from "../components/FolioPanel";
import { GuestName } from "../components/GuestName";
import { useToast } from "../components/Toaster";
import {
  EmptyState,
  ErrorText,
  Field,
  Select,
  Spinner,
  StatusBadge,
  TextInput,
} from "../components/ui";
import { fmtDate } from "../lib/dates";
import { formatMoney, toMajorString, toMinor } from "../lib/money";
import type { RoomLine } from "../api/types";

export interface PendingUpgrade {
  roomId: number;
  amountMinor: number;
  isFree: boolean;
  fromViewId: number | null;
  toViewId: number | null;
  description: string;
}

export function ReservationDetail() {
  const { id } = useParams();
  const rid = Number(id);
  const { can } = useAuth();
  const toast = useToast();
  const { data: res, isLoading, error } = useReservation(rid);
  const roomTypes = useRoomTypeMap();
  const allRooms = useRooms();
  const companies = useCompanies();
  const statusActions = useReservationAction(rid);
  const fd = useFrontDeskActions();
  const undo = useUndoAction();
  const amend = useAmendReservation(rid);
  const [amending, setAmending] = useState(false);

  const roomNumbers = useMemo(
    () => new Map((allRooms.data ?? []).map((r) => [r.id, r.number])),
    [allRooms.data],
  );

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
          {res.company_id && (
            <div className="stat">
              <div className="lbl">Billed to</div>
              <div>
                {companies.data?.find((c) => c.id === res.company_id)?.name ?? `#${res.company_id}`}
              </div>
            </div>
          )}
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
                  roomNumbers={roomNumbers}
                  canAssign={canOperate && ["confirmed", "in_house"].includes(res.status)}
                  onAssign={(roomId, opts) =>
                    fd.assign.mutate(
                      {
                        reservationId: rid,
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
                                      { auditEventId: data.audit_event_id!, reservationId: rid },
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
          {canManage && ["inquiry", "confirmed"].includes(res.status) && (
            <button className="btn" onClick={() => setAmending(true)}>
              Amend
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

      {amending && (
        <AmendRoomsModal
          reservation={res}
          busy={amend.isPending}
          onClose={() => setAmending(false)}
          onSubmit={(rooms) =>
            amend.mutate(
              { rooms },
              {
                onSuccess: () => {
                  toast.ok("Reservation amended");
                  setAmending(false);
                },
                onError: toast.error,
              },
            )
          }
        />
      )}
    </>
  );
}

export function RoomLineRow({
  line,
  typeName,
  currency,
  roomNumbers,
  canAssign,
  onAssign,
  allowUpgrade = false,
  reservationId,
  pendingUpgrade,
  onPendingUpgrade,
}: {
  line: RoomLine;
  typeName: string;
  currency: string;
  roomNumbers: Map<number, string>;
  canAssign: boolean;
  onAssign: (
    roomId: number,
    opts?: { allowTypeMismatch?: boolean; onAssigned?: () => void },
  ) => void;
  /** Widens the room picker to any active room (not just the booked type) and
   * offers a suggested-price confirm step before assigning — used at check-in
   * time to offer a free or paid upgrade. Default false leaves this row
   * exactly as it behaves outside the front-desk check-in flow. */
  allowUpgrade?: boolean;
  reservationId?: number;
  pendingUpgrade?: PendingUpgrade | null;
  onPendingUpgrade?: (upgrade: PendingUpgrade | null) => void;
}) {
  const candidates = useRooms(
    allowUpgrade ? undefined : canAssign ? line.room_type_id : undefined,
  );
  const views = useRoomViews();
  const assignedId = line.assigned_room_id;
  const assignedLabel =
    assignedId !== null ? `Room ${roomNumbers.get(assignedId) ?? `#${assignedId}`}` : null;

  const [previewRoomId, setPreviewRoomId] = useState<number | null>(null);
  const [amountText, setAmountText] = useState("");
  const quote = useUpgradeQuote(reservationId ?? 0, line.id, previewRoomId);
  const viewNames = new Map((views.data ?? []).map((v) => [v.id, v.name]));

  function confirmUpgrade() {
    if (previewRoomId === null || !quote.data) return;
    const roomId = previewRoomId;
    const amountMinor =
      amountText.trim() === "" ? quote.data.total_minor : Math.max(toMinor(amountText, currency), 0);
    const { from_view_id: fromViewId, to_view_id: toViewId } = quote.data;
    // Only record the pending upgrade charge once the room is actually
    // assigned — a failed assign (e.g. room no longer free) must not leave a
    // charge queued for a room the guest was never placed in.
    onAssign(roomId, {
      allowTypeMismatch: true,
      onAssigned: () =>
        onPendingUpgrade?.({
          roomId,
          amountMinor,
          isFree: amountMinor <= 0,
          fromViewId,
          toViewId,
          description: "",
        }),
    });
    setPreviewRoomId(null);
    setAmountText("");
  }

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
        {canAssign ? (
          <Select
            options={roomOptions(line, candidates.data, roomNumbers, allowUpgrade ? viewNames : undefined)}
            value={assignedId !== null ? String(assignedId) : ""}
            onChange={(e) => {
              const next = e.target.value;
              if (!next) return;
              const roomId = Number(next);
              if (roomId === assignedId) return;
              if (allowUpgrade) {
                setPreviewRoomId(roomId);
                setAmountText("");
              } else {
                onAssign(roomId);
              }
            }}
          />
        ) : assignedLabel ? (
          assignedLabel
        ) : (
          <span className="muted">unassigned</span>
        )}
        {allowUpgrade && previewRoomId !== null && (
          <div className="card" style={{ marginTop: 8, padding: 10 }}>
            {quote.isLoading && <Spinner />}
            {quote.data && (
              <>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
                  Suggested upgrade price: {formatMoney(quote.data.total_minor, currency)} for{" "}
                  {quote.data.nights} night{quote.data.nights === 1 ? "" : "s"}
                </div>
                <div className="form-row" style={{ alignItems: "flex-end" }}>
                  <Field label="Charge (0 = free)">
                    <TextInput
                      value={amountText}
                      onChange={(e) => setAmountText(e.target.value)}
                      placeholder={toMajorString(quote.data.total_minor, currency)}
                    />
                  </Field>
                  <div className="btn-row">
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => setPreviewRoomId(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      type="button"
                      onClick={confirmUpgrade}
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        {allowUpgrade && pendingUpgrade && previewRoomId === null && (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {pendingUpgrade.isFree
              ? "Free upgrade"
              : `+${formatMoney(pendingUpgrade.amountMinor, currency)} upgrade`}{" "}
            pending check-in
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => onPendingUpgrade?.(null)}
              style={{ marginLeft: 6 }}
            >
              Remove
            </button>
          </div>
        )}
      </td>
      <td className="num-cell">{formatMoney(line.rate_total_minor, currency)}</td>
    </tr>
  );
}

function roomOptions(
  line: RoomLine,
  candidates: Room[] | undefined,
  roomNumbers: Map<number, string>,
  viewNames?: Map<number, string>,
): [string, string][] {
  const opts: [string, string][] = [
    [line.assigned_room_id !== null ? String(line.assigned_room_id) : "", "— assign —"],
  ];
  const seen = new Set<number>();
  // the currently assigned room first, even if it's inactive / a different type
  if (line.assigned_room_id !== null) {
    seen.add(line.assigned_room_id);
    opts[0] = [
      String(line.assigned_room_id),
      `Room ${roomNumbers.get(line.assigned_room_id) ?? `#${line.assigned_room_id}`}`,
    ];
  }
  for (const r of candidates ?? []) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const view = r.view_id != null ? viewNames?.get(r.view_id) : undefined;
    opts.push([String(r.id), view ? `Room ${r.number} — ${view}` : `Room ${r.number}`]);
  }
  return opts;
}
