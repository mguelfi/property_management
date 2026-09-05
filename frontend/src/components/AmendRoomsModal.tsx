import { useState, type FormEvent } from "react";
import { useRatePlans, useRoomTypes } from "../api/hooks";
import type { Reservation, RoomLineIn } from "../api/types";
import { Field, Modal, Select, TextInput } from "./ui";

export function AmendRoomsModal({
  reservation,
  busy,
  onClose,
  onSubmit,
}: {
  reservation: Reservation;
  busy: boolean;
  onClose: () => void;
  onSubmit: (rooms: RoomLineIn[]) => void;
}) {
  const roomTypes = useRoomTypes();
  const ratePlans = useRatePlans();
  const [lines, setLines] = useState<RoomLineIn[]>(
    reservation.rooms.map((r) => ({
      room_type_id: r.room_type_id,
      rate_plan_id: r.rate_plan_id,
      arrival: r.arrival,
      departure: r.departure,
      adults: r.adults,
      children: r.children,
      guest_name: r.guest_name,
    })),
  );

  function update(i: number, patch: Partial<RoomLineIn>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit(lines);
  }

  const roomTypeOptions: [string, string][] = (roomTypes.data ?? []).map((t) => [
    String(t.id),
    `${t.code} — ${t.name}`,
  ]);
  const ratePlanOptions: [string, string][] = (ratePlans.data ?? []).map((p) => [
    String(p.id),
    `${p.code} — ${p.name}`,
  ]);

  return (
    <Modal title={`Amend ${reservation.reference}`} onClose={onClose}>
      <form onSubmit={submit}>
        {lines.map((line, i) => (
          <div className="card" key={i} style={{ marginBottom: 12 }}>
            <div className="form-row">
              <Field label="Room type">
                <Select
                  value={String(line.room_type_id)}
                  onChange={(e) => update(i, { room_type_id: Number(e.target.value) })}
                  options={roomTypeOptions}
                />
              </Field>
              <Field label="Rate plan">
                <Select
                  value={String(line.rate_plan_id)}
                  onChange={(e) => update(i, { rate_plan_id: Number(e.target.value) })}
                  options={ratePlanOptions}
                />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Arrival">
                <TextInput
                  type="date"
                  value={line.arrival}
                  onChange={(e) => update(i, { arrival: e.target.value })}
                />
              </Field>
              <Field label="Departure">
                <TextInput
                  type="date"
                  value={line.departure}
                  onChange={(e) => update(i, { departure: e.target.value })}
                />
              </Field>
              <Field label="Adults">
                <TextInput
                  type="number"
                  min="1"
                  value={line.adults}
                  onChange={(e) => update(i, { adults: Math.max(1, Number(e.target.value)) })}
                />
              </Field>
              <Field label="Children">
                <TextInput
                  type="number"
                  min="0"
                  value={line.children}
                  onChange={(e) => update(i, { children: Math.max(0, Number(e.target.value)) })}
                />
              </Field>
            </div>
            {lines.length > 1 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
              >
                Remove line
              </button>
            )}
          </div>
        ))}
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              setLines((ls) => [
                ...ls,
                {
                  room_type_id: roomTypes.data?.[0]?.id ?? 0,
                  rate_plan_id: ratePlans.data?.[0]?.id ?? 0,
                  arrival: reservation.arrival,
                  departure: reservation.departure,
                  adults: 2,
                  children: 0,
                },
              ])
            }
          >
            Add line
          </button>
        </div>
        <button className="btn btn-primary" disabled={busy || lines.length === 0}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
    </Modal>
  );
}
