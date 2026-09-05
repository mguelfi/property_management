import { useState } from "react";
import {
  useArrivalsDeparturesReport,
  useNightAudit,
  useOccupancyReport,
  useRevenueReport,
} from "../../api/hooks";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toaster";
import { EmptyState, ErrorText, Field, Spinner, TextInput } from "../../components/ui";
import { addDaysISO, fmtDate, todayISO } from "../../lib/dates";
import { formatMoney } from "../../lib/money";

export function AdminReports() {
  const { can } = useAuth();
  const toast = useToast();
  const [start, setStart] = useState(addDaysISO(todayISO(), -7));
  const [end, setEnd] = useState(addDaysISO(todayISO(), 1));
  const rangeValid = end > start;

  const occupancy = useOccupancyReport(rangeValid ? start : "", rangeValid ? end : "");
  const revenue = useRevenueReport(rangeValid ? start : "", rangeValid ? end : "");
  const arrDep = useArrivalsDeparturesReport(rangeValid ? start : "", rangeValid ? end : "");
  const nightAudit = useNightAudit();

  const avgOccupancy = occupancy.data?.length
    ? occupancy.data.reduce((s, o) => s + o.occupancy_pct, 0) / occupancy.data.length
    : null;

  return (
    <>
      <div className="page-head">
        <h2>Reports</h2>
      </div>

      {can("frontdesk.night_audit") && (
        <div className="card">
          <h2>Night audit</h2>
          <p className="muted">
            Posts last night's room charges to every in-house folio and marks still-unarrived
            confirmed reservations as no-show. Safe to run more than once for the same day.
          </p>
          <button
            className="btn btn-primary"
            disabled={nightAudit.isPending}
            onClick={() =>
              nightAudit.mutate(undefined, {
                onSuccess: (r) =>
                  toast.ok(
                    `Night audit complete: ${r.charges_posted} charge(s) posted, ${r.no_shows_marked} no-show(s) marked`,
                  ),
                onError: toast.error,
              })
            }
          >
            {nightAudit.isPending ? "Running…" : "Run night audit"}
          </button>
        </div>
      )}

      <div className="card">
        <div className="form-row">
          <Field label="From">
            <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="To" error={rangeValid ? undefined : "Must be after From"}>
            <TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
      </div>

      {rangeValid && (
        <>
          <div className="card card-row">
            <div className="stat">
              <div className="num">{avgOccupancy !== null ? `${avgOccupancy.toFixed(0)}%` : "—"}</div>
              <div className="lbl">Avg. occupancy</div>
            </div>
            <div className="stat">
              <div className="num">
                {revenue.data ? formatMoney(revenue.data.adr_minor, revenue.data.currency) : "—"}
              </div>
              <div className="lbl">ADR</div>
            </div>
            <div className="stat">
              <div className="num">
                {revenue.data ? formatMoney(revenue.data.revpar_minor, revenue.data.currency) : "—"}
              </div>
              <div className="lbl">RevPAR</div>
            </div>
            <div className="stat">
              <div className="num">
                {revenue.data
                  ? formatMoney(revenue.data.room_revenue_minor, revenue.data.currency)
                  : "—"}
              </div>
              <div className="lbl">Room revenue</div>
            </div>
          </div>

          <div className="card">
            <h2>Arrivals &amp; departures</h2>
            {(occupancy.isLoading || revenue.isLoading || arrDep.isLoading) && <Spinner />}
            <ErrorText error={occupancy.error || revenue.error || arrDep.error} />
            {(arrDep.data ?? []).length === 0 && !arrDep.isLoading && (
              <EmptyState>No data for this range.</EmptyState>
            )}
            {(arrDep.data ?? []).length > 0 && (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="num-cell">Occupancy</th>
                      <th className="num-cell">Arrivals</th>
                      <th className="num-cell">Departures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(arrDep.data ?? []).map((row) => {
                      const occ = occupancy.data?.find((o) => o.date === row.date);
                      return (
                        <tr key={row.date}>
                          <td>{fmtDate(row.date)}</td>
                          <td className="num-cell">{occ ? `${occ.occupancy_pct}%` : "—"}</td>
                          <td className="num-cell">{row.arrivals}</td>
                          <td className="num-cell">{row.departures}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
