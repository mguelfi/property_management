import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useFolioForReservation,
  useFrontDeskActions,
  useFrontDeskBoard,
  useUndoAction,
} from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { AssignRoomDrawer } from "../components/frontdesk/AssignRoomDrawer";
import { FrontDeskBoard } from "../components/frontdesk/FrontDeskBoard";
import { WalkInForm } from "../components/frontdesk/WalkInForm";
import { GuestName } from "../components/GuestName";
import { useToast } from "../components/Toaster";
import { EmptyState, ErrorText, Spinner } from "../components/ui";
import { fmtDate } from "../lib/dates";
import { formatMoney } from "../lib/money";
import type { PendingUpgrade } from "./ReservationDetail";
import { useUITheme } from "../theme/UIThemeContext";
import type { ArrivalRow, UpgradeChargeIn } from "../api/types";

type Tab = "arrivals" | "in-house" | "departures" | "walk-in";

export function FrontDesk() {
  const { isDense } = useUITheme();
  const [tab, setTab] = useState<Tab>("arrivals");
  const [assignFor, setAssignFor] = useState<number | null>(null);
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

  if (isDense) {
    return (
      <>
        <h1>Front desk</h1>
        <FrontDeskBoard />
      </>
    );
  }

  return (
    <>
      <h1>Front desk</h1>
      <div className="tabs">
        {(["arrivals", "in-house", "departures", "walk-in"] as Tab[]).map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "walk-in" ? "Walk-in" : t === "in-house" ? "In-house" : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "arrivals" && (
        <ArrivalsTab
          onAssign={setAssignFor}
          pendingUpgrades={pendingUpgrades}
          onCheckedIn={clearPendingUpgrades}
        />
      )}
      {tab === "in-house" && <CheckoutBoard kind="in-house" />}
      {tab === "departures" && <CheckoutBoard kind="departures" />}
      {tab === "walk-in" && <WalkInTab />}
      {assignFor !== null && (
        <AssignRoomDrawer
          reservationId={assignFor}
          onClose={() => setAssignFor(null)}
          pendingUpgrades={pendingUpgrades.get(assignFor) ?? new Map()}
          onPendingUpgrade={(lineId, upgrade) => setPendingUpgrade(assignFor, lineId, upgrade)}
        />
      )}
    </>
  );
}

function ArrivalsTab({
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

  if (isLoading) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!data?.length) return <EmptyState>No arrivals today.</EmptyState>;

  return (
    <div className="card table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Ref</th>
            <th>Guest</th>
            <th>Stay</th>
            <th>Rooms</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.map((r: ArrivalRow) => {
            const upgrades = pendingUpgrades.get(r.id);
            return (
              <tr key={r.id}>
                <td>
                  <Link to={`/reservations/${r.id}`}>{r.reference}</Link>
                </td>
                <td>
                  <GuestName id={r.primary_guest_id} />
                </td>
                <td>
                  {fmtDate(r.arrival)} → {fmtDate(r.departure)}
                </td>
                <td>
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
                </td>
                <td className="num-cell">
                  {canOperate && (
                    <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                      <button className="btn btn-sm" onClick={() => onAssign(r.id)}>
                        {r.unassigned_rooms > 0 ? "Assign room" : "Change / upgrade"}
                      </button>
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CheckoutBoard({ kind }: { kind: "in-house" | "departures" }) {
  const { data, isLoading, error } = useFrontDeskBoard(kind);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!data?.length) return <EmptyState>Nobody {kind === "departures" ? "departing" : "in-house"}.</EmptyState>;
  return (
    <div className="card table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Ref</th>
            <th>Guest</th>
            <th>Departs</th>
            <th className="num-cell">Balance</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <CheckoutRow key={r.id} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CheckoutRow({ row }: { row: ArrivalRow }) {
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
    <tr>
      <td>
        <Link to={`/reservations/${row.id}`}>{row.reference}</Link>
      </td>
      <td>
        <GuestName id={row.primary_guest_id} />
      </td>
      <td>{fmtDate(row.departure)}</td>
      <td className="num-cell">
        {folio.isLoading ? "…" : <span className={owes ? "error-text" : undefined}>{formatMoney(balance, currency)}</span>}
      </td>
      <td className="num-cell">
        {can("frontdesk.operate") && (
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
        )}
      </td>
    </tr>
  );
}

function WalkInTab() {
  return (
    <div className="card">
      <WalkInForm />
    </div>
  );
}
