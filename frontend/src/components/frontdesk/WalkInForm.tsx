import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAvailability, useCreateGuest, useFrontDeskActions } from "../../api/hooks";
import { useToast } from "../Toaster";
import { EmptyState, ErrorText, Field, Spinner, TextInput } from "../ui";
import { addDaysISO, todayISO } from "../../lib/dates";
import { formatMoney } from "../../lib/money";

interface Pick {
  room_type_id: number;
  rate_plan_id: number;
  label: string;
  max_occupancy: number;
  adults: number;
}

/** Availability search + guest details form used to register and check in a
 * walk-in. Shared by the standard "Walk-in" tab and the dense-kanban drawer. */
export function WalkInForm() {
  const navigate = useNavigate();
  const toast = useToast();
  const [departure, setDeparture] = useState(addDaysISO(todayISO(), 1));
  const [adults, setAdults] = useState(2);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [guest, setGuest] = useState({ first_name: "", last_name: "" });

  const arrival = todayISO();
  const availability = useAvailability({
    arrival,
    departure,
    adults,
    children: 0,
    enabled: departure > arrival,
    multiRoom: true,
  });
  // As soon as any returned room type can't sleep the whole party in one
  // room, switch the picks table into multi-room mode.
  const needsSplit = (availability.data ?? []).some((o) => o.max_occupancy < adults);
  const allocatedAdults = picks.reduce((s, p) => s + p.adults, 0);
  const createGuest = useCreateGuest();
  const fd = useFrontDeskActions();

  function addPick(offer: { room_type_id: number; room_type_name: string; max_occupancy: number }, rate: { rate_plan_id: number; rate_plan_name: string }) {
    const remaining = Math.max(adults - allocatedAdults, 0);
    const pickAdults =
      needsSplit || offer.max_occupancy < adults
        ? Math.min(Math.max(remaining, 1), offer.max_occupancy)
        : adults;
    setPicks((p) => [
      ...p,
      {
        room_type_id: offer.room_type_id,
        rate_plan_id: rate.rate_plan_id,
        label: `${offer.room_type_name} · ${rate.rate_plan_name}`,
        max_occupancy: offer.max_occupancy,
        adults: pickAdults,
      },
    ]);
  }

  function updatePick(index: number, adultsValue: number) {
    setPicks((p) => p.map((pick, i) => (i === index ? { ...pick, adults: adultsValue } : pick)));
  }

  async function submit() {
    if (!picks.length) return toast.error("Choose at least one room");
    if (!guest.first_name || !guest.last_name) return toast.error("Guest name required");
    try {
      const g = await createGuest.mutateAsync(guest);
      const result = await fd.walkIn.mutateAsync({
        primary_guest_id: g.id,
        source: "walk_in",
        status: "confirmed",
        rooms: picks.map((p) => ({
          room_type_id: p.room_type_id,
          rate_plan_id: p.rate_plan_id,
          arrival,
          departure,
          adults: p.adults,
          children: 0,
        })),
      });
      toast.ok(result.message);
      navigate(`/reservations/${result.reservation.id}`);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <>
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
      {needsSplit && !availability.isLoading && (
        <p className="muted" style={{ fontSize: 12.5 }}>
          No single room sleeps all {adults} guests. Add multiple rooms below and adjust each
          one's occupancy — currently covering {allocatedAdults} of {adults} guests.
        </p>
      )}
      {availability.data?.length === 0 && !availability.isLoading && (
        <EmptyState>No room types match.</EmptyState>
      )}
      {availability.data?.map((offer) => (
        <div className="offer" key={offer.room_type_id}>
          <div className="offer-head">
            <span>{offer.room_type_name}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="muted">
                {offer.units_available} available · sleeps {offer.max_occupancy}
              </span>
              {offer.max_occupancy < adults && (
                <span className="badge badge-inquiry">needs multiple rooms</span>
              )}
            </span>
          </div>
          {offer.rate_plans.map((rate) => (
            <div key={rate.rate_plan_id} className={`rate-option ${rate.sellable ? "" : "disabled"}`}>
              <button
                className="btn btn-sm"
                disabled={!rate.sellable || offer.units_available < 1}
                onClick={() => addPick(offer, rate)}
              >
                Add
              </button>
              <span>{rate.rate_plan_name}</span>
              <span className="muted">{formatMoney(rate.total_minor, rate.currency)}</span>
            </div>
          ))}
        </div>
      ))}

      {picks.length > 0 && (
        <table className="data" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Selected</th>
              {needsSplit && <th>Adults</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {picks.map((p, i) => (
              <tr key={i}>
                <td>{p.label}</td>
                {needsSplit && (
                  <td>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={p.max_occupancy}
                      value={p.adults}
                      style={{ width: 64 }}
                      onChange={(e) => updatePick(i, Math.max(1, Number(e.target.value)))}
                    />
                  </td>
                )}
                <td className="num-cell">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPicks((x) => x.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

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
    </>
  );
}
