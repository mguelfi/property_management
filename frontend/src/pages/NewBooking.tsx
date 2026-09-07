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
  max_occupancy: number;
  adults: number;
  children: number;
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

  const partySize = adults + children;
  const datesValid = departure > arrival;
  const availability = useAvailability({
    arrival,
    departure,
    adults,
    children,
    enabled: searched && datesValid,
    multiRoom: true,
  });
  // As soon as any returned room type can't sleep the whole party in one
  // room, switch the picks table into multi-room mode: editable per-room
  // occupancy plus a running total against the party size.
  const needsSplit = (availability.data ?? []).some((o) => o.max_occupancy < partySize);

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
  const allocatedAdults = picks.reduce((s, p) => s + p.adults, 0);
  const allocatedChildren = picks.reduce((s, p) => s + p.children, 0);

  function addPick(offer: RoomTypeOffer, rate: RatePlanOffer) {
    let pickAdults = adults;
    let pickChildren = children;
    if (needsSplit || offer.max_occupancy < partySize) {
      const remainingAdults = Math.max(adults - allocatedAdults, 0);
      const remainingChildren = Math.max(children - allocatedChildren, 0);
      pickAdults = Math.min(Math.max(remainingAdults, 1), offer.max_occupancy);
      pickChildren = Math.min(remainingChildren, Math.max(offer.max_occupancy - pickAdults, 0));
    }
    setPicks((p) => [
      ...p,
      {
        room_type_id: offer.room_type_id,
        rate_plan_id: rate.rate_plan_id,
        label: `${offer.room_type_name} · ${rate.rate_plan_name}`,
        total_minor: rate.total_minor,
        currency: rate.currency,
        max_occupancy: offer.max_occupancy,
        adults: pickAdults,
        children: pickChildren,
      },
    ]);
  }

  function updatePick(index: number, changes: Partial<Pick>) {
    setPicks((p) => p.map((pick, i) => (i === index ? { ...pick, ...changes } : pick)));
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
          adults: p.adults,
          children: p.children,
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
          {needsSplit && !availability.isLoading && (
            <p className="muted" style={{ fontSize: 12.5 }}>
              No single room sleeps all {partySize} guests. Add multiple rooms below and adjust
              each one's occupancy — currently covering {allocatedAdults + allocatedChildren} of{" "}
              {partySize} guests.
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
                  {offer.max_occupancy < partySize && (
                    <span className="badge badge-inquiry">needs multiple rooms</span>
                  )}
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
                  {needsSplit && <th>Adults</th>}
                  {needsSplit && <th>Children</th>}
                  <th className="num-cell">Total</th>
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
                          onChange={(e) =>
                            updatePick(i, { adults: Math.max(1, Number(e.target.value)) })
                          }
                        />
                      </td>
                    )}
                    {needsSplit && (
                      <td>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={p.max_occupancy}
                          value={p.children}
                          style={{ width: 64 }}
                          onChange={(e) =>
                            updatePick(i, { children: Math.max(0, Number(e.target.value)) })
                          }
                        />
                      </td>
                    )}
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
                  {needsSplit && <th />}
                  {needsSplit && <th />}
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
