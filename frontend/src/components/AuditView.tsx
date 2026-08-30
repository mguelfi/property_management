import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { GuestName } from "./GuestName";
import type { AuditEvent } from "../api/types";

export type RoomMap = Map<number, string>;

const ISO_DATETIME = /^\d{4}-\d\d-\d\dT/;

export function AuditActor({ ev }: { ev: AuditEvent }) {
  if (ev.actor_username) return <>{ev.actor_username}</>;
  if (ev.actor_id != null) return <>{`#${ev.actor_id}`}</>;
  return <span className="muted">system</span>;
}

export function AuditEntity({ ev, rooms }: { ev: AuditEvent; rooms: RoomMap }) {
  const { entity_type: type, entity_id: id, payload } = ev;
  if (!type || id == null) return <span className="muted">—</span>;

  switch (type) {
    case "guest":
      return <GuestName id={id} />;
    case "reservation":
    case "reservation_room": {
      const ref = typeof payload.reference === "string" ? payload.reference : `#${id}`;
      const resId =
        type === "reservation"
          ? id
          : typeof payload.reservation_id === "number"
            ? payload.reservation_id
            : undefined;
      const label = type === "reservation_room" ? `${ref} (room line)` : ref;
      return resId ? <Link to={`/reservations/${resId}`}>{label}</Link> : <>{label}</>;
    }
    case "room":
      return <>{roomLabel(id, rooms)}</>;
    case "folio":
      return <Link to={`/folio/${id}`}>{`Folio #${id}`}</Link>;
    default:
      return <>{`${type} #${id}`}</>;
  }
}

function roomLabel(id: number, rooms: RoomMap): string {
  const n = rooms.get(id);
  return n ? `Room ${n}` : `Room #${id}`;
}

function humanKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\bid\b/, "").trim() || key;
}

function fmtValue(
  key: string,
  value: unknown,
  rooms: RoomMap,
  ev: AuditEvent,
): ReactNode {
  if (value === null || value === undefined) return <span className="muted">—</span>;

  if (key === "room_ids" && Array.isArray(value)) {
    return value.map((v) => roomLabel(Number(v), rooms)).join(", ") || "—";
  }
  if ((key === "room_id" || key === "previous_room_id") && typeof value === "number") {
    return roomLabel(value, rooms);
  }
  if (key === "reservation_id" && typeof value === "number") {
    const ref = typeof ev.payload.reference === "string" ? ev.payload.reference : `#${value}`;
    return <Link to={`/reservations/${value}`}>{ref}</Link>;
  }
  if (key === "reservation_room_id" && typeof value === "number") {
    return `Room line #${value}`;
  }
  if (key === "guest_id" && typeof value === "number") {
    return <GuestName id={value} />;
  }
  if (key === "actor_id") {
    return ev.actor_username ?? (typeof value === "number" ? `#${value}` : String(value));
  }
  if (typeof value === "string" && ISO_DATETIME.test(value)) {
    return new Date(value).toLocaleString();
  }
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "object") return <code>{JSON.stringify(value)}</code>;
  return String(value);
}

export function AuditPayload({ ev, rooms }: { ev: AuditEvent; rooms: RoomMap }) {
  // `reference` is folded into the reservation link; drop it as a standalone row.
  const entries = Object.entries(ev.payload).filter(
    ([k, v]) => k !== "reference" && v !== null && v !== "",
  );
  if (entries.length === 0) return <span className="muted">—</span>;
  return (
    <details>
      <summary className="muted">details</summary>
      <table className="data" style={{ marginTop: 4, marginBottom: 0 }}>
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k}>
              <td className="muted" style={{ width: "38%" }}>
                {humanKey(k)}
              </td>
              <td>{fmtValue(k, v, rooms, ev)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
