import { useState } from "react";
import { Link } from "react-router-dom";
import { useFolioForReservation, useFrontDeskActions, useFrontDeskBoard } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { FrontDeskBoard } from "../components/frontdesk/FrontDeskBoard";
import { WalkInForm } from "../components/frontdesk/WalkInForm";
import { GuestName } from "../components/GuestName";
import { useToast } from "../components/Toaster";
import { EmptyState, ErrorText, Spinner } from "../components/ui";
import { fmtDate } from "../lib/dates";
import { formatMoney } from "../lib/money";
import { useUITheme } from "../theme/UIThemeContext";
import type { ArrivalRow } from "../api/types";

type Tab = "arrivals" | "in-house" | "departures" | "walk-in";

export function FrontDesk() {
  const { isDense } = useUITheme();
  const [tab, setTab] = useState<Tab>("arrivals");

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
      {tab === "arrivals" && <ArrivalsTab />}
      {tab === "in-house" && <CheckoutBoard kind="in-house" />}
      {tab === "departures" && <CheckoutBoard kind="departures" />}
      {tab === "walk-in" && <WalkInTab />}
    </>
  );
}

function ArrivalsTab() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, isLoading, error } = useFrontDeskBoard("arrivals");
  const fd = useFrontDeskActions();
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
          {data.map((r: ArrivalRow) => (
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
              </td>
              <td className="num-cell">
                {canOperate && (
                  <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                    {r.unassigned_rooms > 0 && (
                      <button
                        className="btn btn-sm"
                        onClick={() =>
                          fd.autoAssign.mutate(r.id, {
                            onSuccess: () => toast.ok("Rooms assigned"),
                            onError: toast.error,
                          })
                        }
                      >
                        Auto-assign
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
              </td>
            </tr>
          ))}
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
                { onSuccess: () => toast.ok(`${row.reference} checked out`), onError: toast.error },
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
