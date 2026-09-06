import { useState } from "react";
import { Link } from "react-router-dom";
import { useFolioForReservation, useFrontDeskActions, useFrontDeskBoard } from "../../api/hooks";
import { useAuth } from "../../auth/AuthContext";
import { fmtDate } from "../../lib/dates";
import { formatMoney } from "../../lib/money";
import { GuestName } from "../GuestName";
import { useToast } from "../Toaster";
import { EmptyState, ErrorText, Spinner } from "../ui";
import { AssignRoomDrawer } from "./AssignRoomDrawer";
import { WalkInDrawer } from "./WalkInDrawer";
import type { ArrivalRow } from "../../api/types";

/** Kanban presentation of the front desk: arrivals / in-house / departures as
 * card columns, with drawers for room assignment and walk-in registration.
 * Reuses the same hooks/mutations as the standard tab-based view. */
export function FrontDeskBoard() {
  const [assignFor, setAssignFor] = useState<number | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);

  return (
    <>
      <div className="page-head">
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setWalkInOpen(true)}>
          + Walk-in
        </button>
      </div>
      <div className="board">
        <ArrivalsColumn onAssign={setAssignFor} />
        <StayColumn kind="in-house" title="In-house" />
        <StayColumn kind="departures" title="Departures" />
      </div>
      {assignFor !== null && (
        <AssignRoomDrawer reservationId={assignFor} onClose={() => setAssignFor(null)} />
      )}
      {walkInOpen && <WalkInDrawer onClose={() => setWalkInOpen(false)} />}
    </>
  );
}

function ArrivalsColumn({ onAssign }: { onAssign: (reservationId: number) => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data, isLoading, error } = useFrontDeskBoard("arrivals");
  const fd = useFrontDeskActions();
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
        {data?.map((r: ArrivalRow) => (
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
                  onClick={() =>
                    fd.checkIn.mutate(r.id, {
                      onSuccess: () => toast.ok(`${r.reference} checked in`),
                      onError: toast.error,
                    })
                  }
                >
                  Check in
                </button>
              </div>
            )}
          </div>
        ))}
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
                { onSuccess: () => toast.ok(`${row.reference} checked out`), onError: toast.error },
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
