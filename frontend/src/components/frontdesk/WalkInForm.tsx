import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAvailability, useCreateGuest, useFrontDeskActions } from "../../api/hooks";
import { useToast } from "../Toaster";
import { ErrorText, Field, Spinner, TextInput } from "../ui";
import { addDaysISO, todayISO } from "../../lib/dates";
import { formatMoney } from "../../lib/money";

/** Availability search + guest details form used to register and check in a
 * walk-in. Shared by the standard "Walk-in" tab and the dense-kanban drawer. */
export function WalkInForm() {
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
    </>
  );
}
