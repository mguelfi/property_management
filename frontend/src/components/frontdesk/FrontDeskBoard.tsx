import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useFolioForReservation,
  useFrontDeskActions,
  useFrontDeskBoard,
  useUndoAction,
} from "../../api/hooks";
import { useAuth } from "../../auth/AuthContext";
import { fmtDate } from "../../lib/dates";
import { formatMoney } from "../../lib/money";
import type { PendingUpgrade } from "../../pages/ReservationDetail";
import { GuestName } from "../GuestName";
import { useToast } from "../Toaster";
import { EmptyState, ErrorText, Spinner } from "../ui";
import { AssignRoomDrawer } from "./AssignRoomDrawer";
import { WalkInDrawer } from "./WalkInDrawer";
import type { ArrivalRow, UpgradeChargeIn } from "../../api/types";

/** Kanban presentation of the front desk: arrivals / in-house / departures as
 * card columns, with drawers for room assignment and walk-in registration.
 * Reuses the same hooks/mutations as the standard tab-based view. */
export function FrontDeskBoard() {
  const [assignFor, setAssignFor] = useState<number | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [pendingUpgrades, setPendingUpgrades] = useState<Map<number, Map<number, PendingUpgrade>>>(
    new Map(),
  );

  function setPendingUpgrade(reservationId: number, lineId: number, upgrade: PendingUpgrade | null) {
    setPendingUpgrades((prev) => {
      const next = new Map(prev);
      const forRes = new Map(next.get(reservationId) ?? []);
      if (upgrade) forRes.set(lineId, upgrade);
      else forRes.delete(lineId);
      if (forRes.size) next.set(reservationId, forRes);
      else next.delete(reservationId);
      return next;
    });
  }

  function clearPendingUpgrades(reservationId: number) {
    setPendingUpgrades((prev) => {
      if (!prev.has(reservationId)) return prev;
      const next = new Map(prev);
      next.delete(reservationId);
      return next;
    });
  }

  return (
    <>
      <div className="page-head">
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setWalkInOpen(true)}>
          + Walk-in
        </button>
      </div>
      <div className="board">
        <ArrivalsColumn
          onAssign={setAssignFor}
          pendingUpgrades={pendingUpgrades}
          onCheckedIn={clearPendingUpgrades}
        />
        <StayColumn kind="in-house" title="In-house" />
        <StayColumn kind="departures" title="Departures" />
      </div>
      {assignFor !== null && (
        <AssignRoomDrawer
          reservationId={assignFor}
          onClose={() => setAssignFor(null)}
          pendingUpgrades={pendingUpgrades.get(assignFor) ?? new Map()}
          onPendingUpgrade={(lineId, upgrade) => setPendingUpgrade(assignFor, lineId, upgrade)}
        />
      )}
      {walkInOpen && <WalkInDrawer onClose={() => setWalkInOpen(false)} />}
    </>
  );
}

function ArrivalsColumn({
  onAssign,
  pendingUpgrades,
  onCheckedIn,
}: {
  onAssign: (reservationId: number) => void;
  pendingUpgrades: Map<number, Map<number, PendingUpgrade>>;
  onCheckedIn: (reservationId: number) => void;
}) {
  const { can } = useAuth();
  const toast = useToast();
  const { data, isLoading, error } = useFrontDeskBoard("arrivals");
  const fd = useFrontDeskActions();
  const undo = useUndoAction();
  const canOperate = can("frontdesk.operate");

  return (
    <div className="board-column">
      <div className="board-column-head">
        Arrivals
        {data && <span className="count">{data.length}</span>}
      </div>
      {isLoading && <Spinner />}
      <ErrorText error={error} />
      {data && data.length === 0 && <EmptyState>No arrivals today.</EmptyState>}
      <div className="board-cards">
        {data?.map((r: ArrivalRow) => {
          const upgrades = pendingUpgrades.get(r.id);
          return (
            <div className="board-card" key={r.id}>
              <div className="board-card-title">
                <Link to={`/reservations/${r.id}`}>{r.reference}</Link>
              </div>
              <div className="board-card-meta">
                <GuestName id={r.primary_guest_id} />
              </div>
              <div className="board-card-meta">
                {fmtDate(r.arrival)} → {fmtDate(r.departure)}
              </div>
              <div style={{ marginTop: 6 }}>
                {r.unassigned_rooms > 0 ? (
                  <span className="badge badge-inquiry">{r.unassigned_rooms} unassigned</span>
                ) : (
                  <span className="badge badge-in_house">assigned</span>
                )}
                {upgrades && upgrades.size > 0 && (
                  <span className="badge badge-confirmed" style={{ marginLeft: 6 }}>
                    upgrade pending
                  </span>
                )}
              </div>
              {canOperate && (
                <div className="board-card-actions">
                  {r.unassigned_rooms > 0 && (
                    <button className="btn btn-sm" onClick={() => onAssign(r.id)}>
                      Assign room
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={r.unassigned_rooms > 0}
                    onClick={() => {
                      const upgradesIn: UpgradeChargeIn[] = Array.from(
                        upgrades?.entries() ?? [],
                      ).map(([lineId, u]) => ({
                        line_id: lineId,
                        amount_minor: u.amountMinor,
                        from_view_id: u.fromViewId,
                        to_view_id: u.toViewId,
                      }));
                      fd.checkIn.mutate(
                        { reservationId: r.id, upgrades: upgradesIn },
                        {
                          onSuccess: (data) => {
                            toast.ok(
                              `${r.reference} checked in`,
                              data.audit_event_id
                                ? {
                                    label: "Undo",
                                    onClick: () =>
                                      undo.mutate(
                                        {
                                          auditEventId: data.audit_event_id!,
                                          reservationId: r.id,
                                        },
                                        { onError: toast.error },
                                      ),
                                  }
                                : undefined,
                            );
                            onCheckedIn(r.id);
                          },
                          onError: toast.error,
                        },
                      );
                    }}
                  >
                    Check in
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StayColumn({ kind, title }: { kind: "in-house" | "departures"; title: string }) {
  const { data, isLoading, error } = useFrontDeskBoard(kind);
  return (
    <div className="board-column">
      <div className="board-column-head">
        {title}
        {data && <span className="count">{data.length}</span>}
      </div>
      {isLoading && <Spinner />}
      <ErrorText error={error} />
      {data && data.length === 0 && (
        <EmptyState>Nobody {kind === "departures" ? "departing" : "in-house"}.</EmptyState>
      )}
      <div className="board-cards">
        {data?.map((r) => (
          <StayCard key={r.id} row={r} />
        ))}
      </div>
    </div>
  );
}

function StayCard({ row }: { row: ArrivalRow }) {
  const { can } = useAuth();
  const toast = useToast();
  const folio = useFolioForReservation(row.id);
  const fd = useFrontDeskActions();
  const undo = useUndoAction();
  const balance = folio.data?.balance_minor ?? 0;
  const currency = folio.data?.currency ?? "";
  const owes = balance !== 0;
  const canOverride = can("billing.checkout_with_balance");

  return (
    <div className="board-card">
      <div className="board-card-title">
        <Link to={`/reservations/${row.id}`}>{row.reference}</Link>
      </div>
      <div className="board-card-meta">
        <GuestName id={row.primary_guest_id} />
      </div>
      <div className="board-card-meta">Departs {fmtDate(row.departure)}</div>
      <div style={{ marginTop: 6 }}>
        {folio.isLoading ? (
          "…"
        ) : (
          <span className={owes ? "error-text" : undefined}>{formatMoney(balance, currency)}</span>
        )}
      </div>
      {can("frontdesk.operate") && (
        <div className="board-card-actions">
          <button
            className="btn btn-sm btn-primary"
            disabled={owes && !canOverride}
            title={owes && !canOverride ? "Settle the folio first" : undefined}
            onClick={() =>
              fd.checkOut.mutate(
                { reservationId: row.id, allowBalance: owes },
                {
                  onSuccess: (data) =>
                    toast.ok(
                      `${row.reference} checked out`,
                      data.audit_event_id
                        ? {
                            label: "Undo",
                            onClick: () =>
                              undo.mutate(
                                { auditEventId: data.audit_event_id!, reservationId: row.id },
                                { onError: toast.error },
                              ),
                          }
                        : undefined,
                    ),
                  onError: toast.error,
                },
              )
            }
          >
            {owes ? "Check out anyway" : "Check out"}
          </button>
        </div>
      )}
    </div>
  );
}
