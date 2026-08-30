import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  useAdminBlocks,
  useAdminRoomTypes,
  useAuditEvents,
  useBlockAdminActions,
  useProperty,
  usePropertyActions,
  useRooms,
} from "../../api/hooks";
import type { Property, RoomBlock } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { todayISO } from "../../lib/dates";
import { useToast } from "../../components/Toaster";
import {
  EmptyState,
  ErrorText,
  Field,
  Modal,
  Pagination,
  Select,
  Spinner,
  Tabs,
  Textarea,
  TextInput,
} from "../../components/ui";

export function AdminProperty() {
  const { can } = useAuth();
  const tabs: [string, string][] = [];
  if (can("inventory.manage")) tabs.push(["property", "Property"], ["blocks", "Room blocks"]);
  if (can("audit.view")) tabs.push(["audit", "Audit log"]);
  const [tab, setTab] = useState(tabs[0]?.[0] ?? "audit");

  return (
    <>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === "property" && can("inventory.manage") && <PropertyTab />}
      {tab === "blocks" && can("inventory.manage") && <BlocksTab />}
      {tab === "audit" && can("audit.view") && <AuditTab />}
    </>
  );
}

// --------------------------------------------------------------------------- //
// Property
// --------------------------------------------------------------------------- //

const PROPERTY_FIELDS: [keyof Property, string][] = [
  ["name", "Name"],
  ["legal_name", "Legal name"],
  ["address_line1", "Address line 1"],
  ["address_line2", "Address line 2"],
  ["city", "City"],
  ["region", "Region"],
  ["postcode", "Postcode"],
  ["country", "Country (2-letter)"],
  ["timezone", "Timezone"],
  ["currency", "Currency (3-letter)"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["check_in_time", "Check-in time"],
  ["check_out_time", "Check-out time"],
];

function PropertyTab() {
  const toast = useToast();
  const property = useProperty();
  const actions = usePropertyActions();
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (property.data) {
      const next: Record<string, string> = {};
      for (const [k] of PROPERTY_FIELDS) next[k] = String(property.data[k] ?? "");
      setForm(next);
    }
  }, [property.data]);

  if (property.isLoading) return <Spinner />;
  if (property.error) return <ErrorText error={property.error} />;

  return (
    <div className="card">
      <h2>Property settings</h2>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          actions.update.mutate(form, {
            onSuccess: () => toast.ok("Saved"),
            onError: toast.error,
          });
        }}
      >
        <div className="form-row">
          {PROPERTY_FIELDS.map(([key, label]) => (
            <Field key={key} label={label}>
              <TextInput
                value={form[key] ?? ""}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        <button className="btn btn-primary" disabled={actions.update.isPending}>
          {actions.update.isPending ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Room blocks
// --------------------------------------------------------------------------- //

const REASONS: [string, string][] = [
  ["out_of_order", "Out of order"],
  ["maintenance", "Maintenance"],
  ["hold", "Hold"],
  ["other", "Other"],
];

function BlocksTab() {
  const toast = useToast();
  const blocks = useAdminBlocks();
  const rooms = useRooms();
  const types = useAdminRoomTypes();
  const actions = useBlockAdminActions();
  const [editing, setEditing] = useState<RoomBlock | null>(null);
  const [creating, setCreating] = useState(false);

  const roomLabel = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rooms.data ?? []) m.set(r.id, r.number);
    return m;
  }, [rooms.data]);
  const typeLabel = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of types.data ?? []) m.set(t.id, t.code);
    return m;
  }, [types.data]);

  return (
    <>
      <div className="page-head">
        <h2>Room blocks</h2>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          New block
        </button>
      </div>

      <div className="card">
        {blocks.isLoading && <Spinner />}
        <ErrorText error={blocks.error} />
        {blocks.data?.length === 0 && <EmptyState>No blocks.</EmptyState>}
        {blocks.data && blocks.data.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Reason</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {blocks.data.map((b) => (
                  <tr key={b.id}>
                    <td>
                      {b.room_id
                        ? `Room ${roomLabel.get(b.room_id) ?? b.room_id}`
                        : `${typeLabel.get(b.room_type_id ?? 0) ?? b.room_type_id} ×${b.units}`}
                    </td>
                    <td>{b.start_date}</td>
                    <td>{b.end_date}</td>
                    <td>{b.reason}</td>
                    <td>{b.note || "—"}</td>
                    <td className="num-cell">
                      <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                        <button className="btn btn-sm" onClick={() => setEditing(b)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            if (!window.confirm("Delete this block?")) return;
                            actions.remove.mutate(b.id, {
                              onSuccess: () => toast.ok("Deleted"),
                              onError: toast.error,
                            });
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <BlockModal
          block={editing}
          rooms={(rooms.data ?? []).map((r) => [String(r.id), r.number] as [string, string])}
          types={(types.data ?? []).map((t) => [String(t.id), t.code] as [string, string])}
          busy={actions.create.isPending || actions.update.isPending}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={(body) => {
            const opts = {
              onSuccess: () => {
                toast.ok("Saved");
                setCreating(false);
                setEditing(null);
              },
              onError: toast.error,
            };
            if (editing) actions.update.mutate({ id: editing.id, body }, opts);
            else actions.create.mutate(body, opts);
          }}
        />
      )}
    </>
  );
}

function BlockModal({
  block,
  rooms,
  types,
  busy,
  onClose,
  onSubmit,
}: {
  block: RoomBlock | null;
  rooms: [string, string][];
  types: [string, string][];
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const editing = !!block;
  const [scope, setScope] = useState<"room" | "type">(
    block?.room_type_id ? "type" : "room",
  );
  const [roomId, setRoomId] = useState(block?.room_id ? String(block.room_id) : "");
  const [typeId, setTypeId] = useState(block?.room_type_id ? String(block.room_type_id) : "");
  const [units, setUnits] = useState(block?.units ?? 1);
  const [start, setStart] = useState(block?.start_date ?? todayISO());
  const [end, setEnd] = useState(block?.end_date ?? todayISO());
  const [reason, setReason] = useState<string>(block?.reason ?? "out_of_order");
  const [note, setNote] = useState(block?.note ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (editing) {
      onSubmit({ units, start_date: start, end_date: end, reason, note });
      return;
    }
    onSubmit({
      room_id: scope === "room" ? Number(roomId) : null,
      room_type_id: scope === "type" ? Number(typeId) : null,
      units: scope === "type" ? units : 1,
      start_date: start,
      end_date: end,
      reason,
      note,
    });
  }

  return (
    <Modal title={editing ? "Edit block" : "New block"} onClose={onClose}>
      <form onSubmit={submit}>
        {!editing && (
          <>
            <Field label="Scope">
              <Select
                value={scope}
                onChange={(e) => setScope(e.target.value as "room" | "type")}
                options={[
                  ["room", "A specific room"],
                  ["type", "A room-type allotment"],
                ]}
              />
            </Field>
            {scope === "room" ? (
              <Field label="Room">
                <Select
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  options={[["", "Choose…"], ...rooms]}
                />
              </Field>
            ) : (
              <div className="form-row">
                <Field label="Room type">
                  <Select
                    value={typeId}
                    onChange={(e) => setTypeId(e.target.value)}
                    options={[["", "Choose…"], ...types]}
                  />
                </Field>
                <Field label="Units">
                  <TextInput
                    type="number"
                    min="1"
                    value={units}
                    onChange={(e) => setUnits(Number(e.target.value))}
                  />
                </Field>
              </div>
            )}
          </>
        )}
        <div className="form-row">
          <Field label="From">
            <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="To" hint="exclusive">
            <TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)} options={REASONS} />
        </Field>
        <Field label="Note">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </Modal>
  );
}

// --------------------------------------------------------------------------- //
// Audit log
// --------------------------------------------------------------------------- //

const AUDIT_PAGE = 25;

function AuditTab() {
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [eventType, setEventType] = useState("");
  const [page, setPage] = useState(0);

  const events = useAuditEvents({
    entity_type: entityType || undefined,
    entity_id: entityId ? Number(entityId) : undefined,
    event_type: eventType || undefined,
    offset: page * AUDIT_PAGE,
    limit: AUDIT_PAGE,
  });
  const pages = events.data ? Math.ceil(events.data.total / AUDIT_PAGE) : 0;

  return (
    <>
      <div className="card">
        <div className="form-row">
          <Field label="Entity type">
            <TextInput
              placeholder="reservation, folio…"
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setPage(0);
              }}
            />
          </Field>
          <Field label="Entity ID">
            <TextInput
              type="number"
              value={entityId}
              onChange={(e) => {
                setEntityId(e.target.value);
                setPage(0);
              }}
            />
          </Field>
          <Field label="Event type">
            <TextInput
              value={eventType}
              onChange={(e) => {
                setEventType(e.target.value);
                setPage(0);
              }}
            />
          </Field>
        </div>
      </div>

      <div className="card">
        {events.isLoading && <Spinner />}
        <ErrorText error={events.error} />
        {events.data?.items.length === 0 && <EmptyState>No events.</EmptyState>}
        {events.data && events.data.items.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Actor</th>
                  <th>Entity</th>
                  <th>Payload</th>
                </tr>
              </thead>
              <tbody>
                {events.data.items.map((ev) => (
                  <tr key={ev.id}>
                    <td>{new Date(ev.occurred_at).toLocaleString()}</td>
                    <td>{ev.event_type}</td>
                    <td>{ev.actor_id ?? "—"}</td>
                    <td>
                      {ev.entity_type}
                      {ev.entity_id != null ? ` #${ev.entity_id}` : ""}
                    </td>
                    <td>
                      <details>
                        <summary className="muted">view</summary>
                        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                          {JSON.stringify(ev.payload, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} onPage={setPage} />
      </div>
    </>
  );
}
