import { Link } from "react-router-dom";
import { useFrontDeskBoard, useRooms } from "../api/hooks";
import { GuestName } from "../components/GuestName";
import { EmptyState, ErrorText, Spinner } from "../components/ui";
import { fmtDate } from "../lib/dates";
import type { ArrivalRow } from "../api/types";

function Board({ title, kind }: { title: string; kind: "arrivals" | "departures" | "in-house" }) {
  const { data, isLoading, error } = useFrontDeskBoard(kind);
  return (
    <div className="card">
      <h2>
        {title} {data ? <span className="muted">({data.length})</span> : null}
      </h2>
      {isLoading && <Spinner />}
      <ErrorText error={error} />
      {data && data.length === 0 && <EmptyState>Nothing today.</EmptyState>}
      {data && data.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Guest</th>
                <th>{kind === "arrivals" ? "Nights" : "Out"}</th>
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
                    {kind === "arrivals"
                      ? `${fmtDate(r.arrival)} → ${fmtDate(r.departure)}`
                      : fmtDate(r.departure)}
                  </td>
                  <td className="num-cell">
                    {kind === "arrivals" && r.unassigned_rooms > 0 && (
                      <span className="badge badge-inquiry">{r.unassigned_rooms} to assign</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Dashboard() {
  const arrivals = useFrontDeskBoard("arrivals");
  const departures = useFrontDeskBoard("departures");
  const inHouse = useFrontDeskBoard("in-house");
  const rooms = useRooms();
  const totalRooms = rooms.data?.length ?? 0;
  const occupied = inHouse.data?.length ?? 0;

  return (
    <>
      <div className="page-head">
        <h1>Today</h1>
        <div className="spacer" />
        <Link className="btn" to="/frontdesk">
          Front desk
        </Link>
        <Link className="btn btn-primary" to="/book">
          New booking
        </Link>
      </div>

      <div className="card card-row">
        <div className="stat">
          <div className="num">{arrivals.data?.length ?? "—"}</div>
          <div className="lbl">Arrivals</div>
        </div>
        <div className="stat">
          <div className="num">{departures.data?.length ?? "—"}</div>
          <div className="lbl">Departures</div>
        </div>
        <div className="stat">
          <div className="num">{occupied}</div>
          <div className="lbl">In-house</div>
        </div>
        <div className="stat">
          <div className="num">
            {totalRooms ? `${Math.round((occupied / totalRooms) * 100)}%` : "—"}
          </div>
          <div className="lbl">Occupancy ({occupied}/{totalRooms || "?"})</div>
        </div>
      </div>

      <div className="grid-2">
        <Board title="Arrivals" kind="arrivals" />
        <Board title="Departures" kind="departures" />
      </div>
      <Board title="In-house" kind="in-house" />
    </>
  );
}
