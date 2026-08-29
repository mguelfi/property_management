import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  useAvailability,
  useCreateGuest,
  useFolioForReservation,
  useFrontDeskActions,
  useFrontDeskBoard,
} from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { GuestName } from "../components/GuestName";
import { useToast } from "../components/Toaster";
import { EmptyState, ErrorText, Field, Spinner, TextInput } from "../components/ui";
import { addDaysISO, fmtDate, todayISO } from "../lib/dates";
import { formatMoney } from "../lib/money";
import type { ArrivalRow } from "../api/types";

type Tab = "arrivals" | "in-house" | "departures" | "walk-in";

export function FrontDesk() {
  const [tab, setTab] = useState<Tab>("arrivals");
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
  const navigate = useNavigate();
  const toast = useToast();
  const [departure, setDeparture] = useState(addDaysISO(todayISO(), 1));
  const [adults, setAdults] = useState(2);
  const [pick, setPick] = useState<{ room_type_id: number; rate_plan_id: number } | null>(null);
  const [guest, setGuest] = useState({ first_name: "", last_name: "" });

  const arrival = todayISO();
  const availability = useAvailability({
    arrival,
    departure,
    adults,
    children: 0,
    enabled: departure > arrival,
  });
  const createGuest = useCreateGuest();
  const fd = useFrontDeskActions();

  async function submit() {
    if (!pick) return toast.error("Choose a room");
    if (!guest.first_name || !guest.last_name) return toast.error("Guest name required");
    try {
      const g = await createGuest.mutateAsync(guest);
      const result = await fd.walkIn.mutateAsync({
        primary_guest_id: g.id,
        source: "walk_in",
        status: "confirmed",
        rooms: [{ ...pick, arrival, departure, adults, children: 0 }],
      });
      toast.ok(result.message);
      navigate(`/reservations/${result.reservation.id}`);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="card">
      <div className="form-row">
        <Field label="Arrival">
          <TextInput value={arrival} disabled />
        </Field>
        <Field label="Departure">
          <TextInput type="date" value={departure} onChange={(e) => setDeparture(e.target.value)} />
        </Field>
        <Field label="Adults">
          <TextInput
            type="number"
            min="1"
            value={adults}
            onChange={(e) => setAdults(Math.max(1, Number(e.target.value)))}
          />
        </Field>
      </div>

      {availability.isLoading && <Spinner />}
      <ErrorText error={availability.error} />
      {availability.data?.map((offer) => (
        <div className="offer" key={offer.room_type_id}>
          <div className="offer-head">
            <span>{offer.room_type_name}</span>
            <span className="muted">{offer.units_available} available</span>
          </div>
          {offer.rate_plans.map((rate) => {
            const selected =
              pick?.room_type_id === offer.room_type_id && pick?.rate_plan_id === rate.rate_plan_id;
            return (
              <div key={rate.rate_plan_id} className={`rate-option ${rate.sellable ? "" : "disabled"}`}>
                <button
                  className={`btn btn-sm ${selected ? "btn-primary" : ""}`}
                  disabled={!rate.sellable || offer.units_available < 1}
                  onClick={() =>
                    setPick({ room_type_id: offer.room_type_id, rate_plan_id: rate.rate_plan_id })
                  }
                >
                  {selected ? "Selected" : "Pick"}
                </button>
                <span>{rate.rate_plan_name}</span>
                <span className="muted">{formatMoney(rate.total_minor, rate.currency)}</span>
              </div>
            );
          })}
        </div>
      ))}

      <div className="form-row">
        <Field label="Guest first name">
          <TextInput
            value={guest.first_name}
            onChange={(e) => setGuest({ ...guest, first_name: e.target.value })}
          />
        </Field>
        <Field label="Guest last name">
          <TextInput
            value={guest.last_name}
            onChange={(e) => setGuest({ ...guest, last_name: e.target.value })}
          />
        </Field>
      </div>

      <button
        className="btn btn-primary"
        disabled={fd.walkIn.isPending || createGuest.isPending}
        onClick={submit}
      >
        {fd.walkIn.isPending ? "Creating…" : "Create walk-in & check in"}
      </button>
    </div>
  );
}
