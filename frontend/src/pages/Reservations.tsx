import { useState } from "react";
import { Link } from "react-router-dom";
import { useReservations } from "../api/hooks";
import { GuestName } from "../components/GuestName";
import { EmptyState, ErrorText, Select, Spinner, StatusBadge, TextInput } from "../components/ui";
import { fmtDate } from "../lib/dates";
import { formatMoney } from "../lib/money";
import type { ReservationStatus } from "../api/types";

const STATUS_OPTS: [string, string][] = [
  ["", "Any status"],
  ["inquiry", "Inquiry"],
  ["confirmed", "Confirmed"],
  ["in_house", "In-house"],
  ["checked_out", "Checked out"],
  ["cancelled", "Cancelled"],
  ["no_show", "No-show"],
];

const PAGE = 25;

export function Reservations() {
  const [status, setStatus] = useState<ReservationStatus | "">("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading, error, isFetching } = useReservations({
    status,
    q: q || undefined,
    limit: PAGE,
    offset: page * PAGE,
  });

  const pages = data ? Math.ceil(data.total / PAGE) : 0;

  return (
    <>
      <div className="page-head">
        <h1>Reservations</h1>
        <div className="spacer" />
        <Link className="btn btn-primary" to="/book">
          New booking
        </Link>
      </div>

      <div className="card">
        <div className="form-row">
          <div className="field">
            <span className="field-label">Search</span>
            <TextInput
              placeholder="Reference…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div className="field">
            <span className="field-label">Status</span>
            <Select
              options={STATUS_OPTS}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as ReservationStatus | "");
                setPage(0);
              }}
            />
          </div>
        </div>
      </div>

      <div className="card">
        {isLoading && <Spinner />}
        <ErrorText error={error} />
        {data && data.items.length === 0 && <EmptyState>No reservations match.</EmptyState>}
        {data && data.items.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Guest</th>
                  <th>Arrival</th>
                  <th>Departure</th>
                  <th>Status</th>
                  <th className="num-cell">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/reservations/${r.id}`}>{r.reference}</Link>
                    </td>
                    <td>
                      <GuestName id={r.primary_guest_id} />
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
        {pages > 1 && (
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </button>
            <span className="muted" style={{ alignSelf: "center" }}>
              Page {page + 1} / {pages} {isFetching ? "…" : ""}
            </span>
            <button
              className="btn btn-sm"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
