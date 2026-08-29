import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useGuest,
  useGuestDuplicates,
  usePatchGuest,
  useReservations,
} from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toaster";
import { EmptyState, ErrorText, Field, Spinner, StatusBadge, TextInput } from "../components/ui";
import { fmtDate } from "../lib/dates";
import { formatMoney } from "../lib/money";

export function GuestDetail() {
  const { id } = useParams();
  const gid = Number(id);
  const { can } = useAuth();
  const toast = useToast();
  const guest = useGuest(gid);
  const dupes = useGuestDuplicates(gid);
  const reservations = useReservations({ guest_id: gid, limit: 50, offset: 0 });
  const patch = usePatchGuest(gid);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    nationality: "",
    notes: "",
  });

  useEffect(() => {
    if (guest.data) {
      setForm({
        first_name: guest.data.first_name,
        last_name: guest.data.last_name,
        email: guest.data.email ?? "",
        phone: guest.data.phone ?? "",
        nationality: guest.data.nationality,
        notes: guest.data.notes,
      });
    }
  }, [guest.data]);

  if (guest.isLoading) return <Spinner />;
  if (guest.error) return <ErrorText error={guest.error} />;
  if (!guest.data) return <EmptyState>Not found.</EmptyState>;

  const editable = can("guests.manage");

  return (
    <>
      <div className="page-head">
        <h1>{guest.data.full_name}</h1>
        <div className="spacer" />
        <Link className="btn btn-sm" to="/guests">
          All guests
        </Link>
      </div>

      {dupes.data && dupes.data.length > 0 && (
        <div className="card" style={{ borderColor: "var(--warn)" }}>
          <strong>Possible duplicate{dupes.data.length > 1 ? "s" : ""}:</strong>{" "}
          {dupes.data.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ", "}
              <Link to={`/guests/${d.id}`}>{d.full_name}</Link>
            </span>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Profile</h2>
        <div className="form-row">
          <Field label="First name">
            <TextInput
              disabled={!editable}
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            />
          </Field>
          <Field label="Last name">
            <TextInput
              disabled={!editable}
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Email">
            <TextInput
              type="email"
              disabled={!editable}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <TextInput
              disabled={!editable}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Nationality">
            <TextInput
              disabled={!editable}
              value={form.nationality}
              onChange={(e) => setForm({ ...form, nationality: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Notes">
          <TextInput
            disabled={!editable}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
        {editable && (
          <button
            className="btn btn-primary"
            disabled={patch.isPending}
            onClick={() =>
              patch.mutate(
                {
                  first_name: form.first_name,
                  last_name: form.last_name,
                  email: form.email || null,
                  phone: form.phone || null,
                  nationality: form.nationality,
                  notes: form.notes,
                },
                { onSuccess: () => toast.ok("Saved"), onError: toast.error },
              )
            }
          >
            {patch.isPending ? "Saving…" : "Save"}
          </button>
        )}
      </div>

      <div className="card">
        <h2>Reservations</h2>
        {reservations.isLoading && <Spinner />}
        {reservations.data?.items.length === 0 && <EmptyState>No reservations.</EmptyState>}
        {reservations.data && reservations.data.items.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Arrival</th>
                  <th>Departure</th>
                  <th>Status</th>
                  <th className="num-cell">Total</th>
                </tr>
              </thead>
              <tbody>
                {reservations.data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/reservations/${r.id}`}>{r.reference}</Link>
                    </td>
                    <td>{fmtDate(r.arrival)}</td>
                    <td>{fmtDate(r.departure)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="num-cell">{formatMoney(r.total_minor, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
