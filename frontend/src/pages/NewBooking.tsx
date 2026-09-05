import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useAvailability,
  useCompanies,
  useCreateGuest,
  useCreateReservation,
  useGuestSearch,
} from "../api/hooks";
import { useToast } from "../components/Toaster";
import { EmptyState, ErrorText, Field, Select, Spinner, TextInput } from "../components/ui";
import { addDaysISO, nightCount, todayISO } from "../lib/dates";
import { formatMoney } from "../lib/money";
import type { RatePlanOffer, RoomTypeOffer } from "../api/types";

interface Pick {
  room_type_id: number;
  rate_plan_id: number;
  label: string;
  total_minor: number;
  currency: string;
}

export function NewBooking() {
  const navigate = useNavigate();
  const toast = useToast();

  const [arrival, setArrival] = useState(todayISO());
  const [departure, setDeparture] = useState(addDaysISO(todayISO(), 1));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [searched, setSearched] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);

  const datesValid = departure > arrival;
  const availability = useAvailability({
    arrival,
    departure,
    adults,
    children,
    enabled: searched && datesValid,
  });

  const [guestMode, setGuestMode] = useState<"existing" | "new">("existing");
  const [guestQuery, setGuestQuery] = useState("");
  const [guestId, setGuestId] = useState<number | null>(null);
  const [newGuest, setNewGuest] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  const guestSearch = useGuestSearch(guestQuery);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const companies = useCompanies();

  const createGuest = useCreateGuest();
  const createReservation = useCreateReservation();

  const nights = nightCount(arrival, departure);
  const grandTotal = picks.reduce((s, p) => s + p.total_minor, 0);
  const currency = picks[0]?.currency ?? "";

  function addPick(offer: RoomTypeOffer, rate: RatePlanOffer) {
    setPicks((p) => [
      ...p,
      {
        room_type_id: offer.room_type_id,
        rate_plan_id: rate.rate_plan_id,
        label: `${offer.room_type_name} · ${rate.rate_plan_name}`,
        total_minor: rate.total_minor,
        currency: rate.currency,
      },
    ]);
  }

  async function book() {
    try {
      let primary_guest_id = guestId;
      if (guestMode === "new") {
        if (!newGuest.first_name || !newGuest.last_name) {
          toast.error("Guest first and last name are required");
          return;
        }
        const g = await createGuest.mutateAsync({
          first_name: newGuest.first_name,
          last_name: newGuest.last_name,
          email: newGuest.email || undefined,
          phone: newGuest.phone || undefined,
        });
        primary_guest_id = g.id;
      }
      if (!primary_guest_id) {
        toast.error("Choose or create a guest");
        return;
      }
      const res = await createReservation.mutateAsync({
        primary_guest_id,
        company_id: companyId,
        status: "confirmed",
        rooms: picks.map((p) => ({
          room_type_id: p.room_type_id,
          rate_plan_id: p.rate_plan_id,
          arrival,
          departure,
          adults,
          children,
        })),
      });
      toast.ok(`Reservation ${res.reference} created`);
      navigate(`/reservations/${res.id}`);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <>
      <h1>New booking</h1>

      <div className="card">
        <h2>1 · Stay</h2>
        <div className="form-row">
          <Field label="Arrival">
            <TextInput type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} />
          </Field>
          <Field label="Departure" error={datesValid ? undefined : "Must be after arrival"}>
            <TextInput
              type="date"
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
            />
          </Field>
          <Field label="Adults">
            <TextInput
              type="number"
              min="1"
              value={adults}
              onChange={(e) => setAdults(Math.max(1, Number(e.target.value)))}
            />
          </Field>
          <Field label="Children">
            <TextInput
              type="number"
              min="0"
              value={children}
              onChange={(e) => setChildren(Math.max(0, Number(e.target.value)))}
            />
          </Field>
        </div>
        <button
          className="btn btn-primary"
          disabled={!datesValid}
          onClick={() => setSearched(true)}
        >
          Search availability ({nights} night{nights === 1 ? "" : "s"})
        </button>
      </div>

      {searched && (
        <div className="card">
          <h2>2 · Rooms</h2>
          {availability.isLoading && <Spinner />}
          <ErrorText error={availability.error} />
          {availability.data?.length === 0 && <EmptyState>No room types match.</EmptyState>}
          {availability.data?.map((offer) => (
            <div className="offer" key={offer.room_type_id}>
              <div className="offer-head">
                <span>{offer.room_type_name}</span>
                <span className="muted">
                  {offer.units_available} available · sleeps {offer.max_occupancy}
                </span>
              </div>
              {offer.rate_plans.map((rate) => (
                <div
                  key={rate.rate_plan_id}
                  className={`rate-option ${rate.sellable ? "" : "disabled"}`}
                >
                  <button
                    className="btn btn-sm"
                    disabled={!rate.sellable || offer.units_available < 1}
                    onClick={() => addPick(offer, rate)}
                  >
                    Add
                  </button>
                  <span>{rate.rate_plan_name}</span>
                  <span className="muted">{formatMoney(rate.total_minor, rate.currency)}</span>
                  {rate.restrictions.length > 0 && (
                    <span className="badge badge-inquiry">{rate.restrictions.join(", ")}</span>
                  )}
                </div>
              ))}
            </div>
          ))}

          {picks.length > 0 && (
            <table className="data" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Selected</th>
                  <th className="num-cell">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {picks.map((p, i) => (
                  <tr key={i}>
                    <td>{p.label}</td>
                    <td className="num-cell">{formatMoney(p.total_minor, p.currency)}</td>
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
              <tfoot>
                <tr>
                  <th>Total</th>
                  <th className="num-cell">{formatMoney(grandTotal, currency)}</th>
                  <th />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {picks.length > 0 && (
        <div className="card">
          <h2>3 · Guest</h2>
          <div className="tabs">
            <button
              className={`tab ${guestMode === "existing" ? "active" : ""}`}
              onClick={() => setGuestMode("existing")}
            >
              Existing
            </button>
            <button
              className={`tab ${guestMode === "new" ? "active" : ""}`}
              onClick={() => setGuestMode("new")}
            >
              New guest
            </button>
          </div>

          {guestMode === "existing" ? (
            <>
              <Field label="Search guests" hint="Type at least 2 characters">
                <TextInput
                  value={guestQuery}
                  onChange={(e) => {
                    setGuestQuery(e.target.value);
                    setGuestId(null);
                  }}
                />
              </Field>
              {guestSearch.data && (
                <Select
                  options={[
                    ["", "— choose —"],
                    ...guestSearch.data.items.map(
                      (g) => [String(g.id), `${g.full_name} ${g.email ? `<${g.email}>` : ""}`] as [
                        string,
                        string,
                      ],
                    ),
                  ]}
                  value={guestId ? String(guestId) : ""}
                  onChange={(e) => setGuestId(e.target.value ? Number(e.target.value) : null)}
                />
              )}
            </>
          ) : (
            <div className="form-row">
              <Field label="First name">
                <TextInput
                  value={newGuest.first_name}
                  onChange={(e) => setNewGuest({ ...newGuest, first_name: e.target.value })}
                />
              </Field>
              <Field label="Last name">
                <TextInput
                  value={newGuest.last_name}
                  onChange={(e) => setNewGuest({ ...newGuest, last_name: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <TextInput
                  type="email"
                  value={newGuest.email}
                  onChange={(e) => setNewGuest({ ...newGuest, email: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <TextInput
                  value={newGuest.phone}
                  onChange={(e) => setNewGuest({ ...newGuest, phone: e.target.value })}
                />
              </Field>
            </div>
          )}

          <Field label="Company (bill to)" hint="Optional">
            <Select
              value={companyId ? String(companyId) : ""}
              onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : null)}
              options={[
                ["", "— none —"],
                ...(companies.data ?? []).map((c) => [String(c.id), c.name] as [string, string]),
              ]}
            />
          </Field>

          <button
            className="btn btn-primary"
            disabled={createReservation.isPending || createGuest.isPending}
            onClick={book}
          >
            {createReservation.isPending ? "Booking…" : `Confirm booking · ${formatMoney(grandTotal, currency)}`}
          </button>
        </div>
      )}
    </>
  );
}
