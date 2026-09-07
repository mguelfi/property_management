import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  useAdminRooms,
  useAdminRoomTypes,
  useAdminRoomViews,
  useFloors,
  useProperty,
  useRoomAdminActions,
  useRoomTypeAdminActions,
  useRoomViewAdminActions,
} from "../../api/hooks";
import type { Room, RoomType, RoomView } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
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
import { formatMoney, toMajorString, toMinor } from "../../lib/money";

const PAGE = 25;

export function AdminRooms() {
  const [tab, setTab] = useState("rooms");
  return (
    <>
      <Tabs
        tabs={[
          ["rooms", "Rooms"],
          ["types", "Room types"],
          ["views", "Views"],
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === "rooms" ? <RoomsTab /> : tab === "types" ? <RoomTypesTab /> : <ViewsTab />}
    </>
  );
}

// --------------------------------------------------------------------------- //
// Room types
// --------------------------------------------------------------------------- //

function RoomTypesTab() {
  const { can } = useAuth();
  const editable = can("inventory.manage");
  const toast = useToast();
  const types = useAdminRoomTypes();
  const actions = useRoomTypeAdminActions();
  const [editing, setEditing] = useState<RoomType | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="page-head">
        <h2>Room types</h2>
        <div className="spacer" />
        {editable && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            New room type
          </button>
        )}
      </div>

      <div className="card">
        {types.isLoading && <Spinner />}
        <ErrorText error={types.error} />
        {types.data && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th className="num-cell">Max occ.</th>
                  <th className="num-cell">Sort</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {types.data.map((rt) => (
                  <tr key={rt.id}>
                    <td>{rt.code}</td>
                    <td>{rt.name}</td>
                    <td className="num-cell">{rt.max_occupancy}</td>
                    <td className="num-cell">{rt.sort_order}</td>
                    <td>
                      {rt.is_active ? (
                        "Active"
                      ) : (
                        <span className="badge badge-cancelled">Inactive</span>
                      )}
                    </td>
                    <td className="num-cell">
                      {editable && (
                        <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                          <button className="btn btn-sm" onClick={() => setEditing(rt)}>
                            Edit
                          </button>
                          {rt.is_active && (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => {
                                if (!window.confirm(`Deactivate ${rt.code}?`)) return;
                                actions.deactivate.mutate(rt.id, {
                                  onSuccess: () => toast.ok("Deactivated"),
                                  onError: toast.error,
                                });
                              }}
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <RoomTypeModal
          roomType={editing}
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

function RoomTypeModal({
  roomType,
  busy,
  onClose,
  onSubmit,
}: {
  roomType: RoomType | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
    code: roomType?.code ?? "",
    name: roomType?.name ?? "",
    description: roomType?.description ?? "",
    max_occupancy: roomType?.max_occupancy ?? 2,
    max_adults: roomType?.max_adults ?? 2,
    standard_occupancy: roomType?.standard_occupancy ?? 2,
    bed_configuration: roomType?.bed_configuration ?? "",
    sort_order: roomType?.sort_order ?? 100,
    overbooking_allowance: roomType?.overbooking_allowance ?? 0,
    is_active: roomType?.is_active ?? true,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { ...f };
    if (roomType) delete body.code; // code is immutable after creation
    onSubmit(body);
  }

  const num = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: Number(e.target.value) });

  return (
    <Modal title={roomType ? `Edit ${roomType.code}` : "New room type"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          {!roomType && (
            <Field
              label="Code"
              hint="A–Z, 0–9, _"
              help="Short unique identifier for this room type (e.g. STD, DLX, SUITE). Used in reports and channel connections. Cannot be changed after creation."
            >
              <TextInput
                required
                pattern="[A-Z0-9_]{2,20}"
                value={f.code}
                onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })}
              />
            </Field>
          )}
          <Field label="Name" help="Guest-facing name for this room type, shown on booking and folio screens.">
            <TextInput
              required
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Description" help="Optional longer marketing description of the room type.">
          <Textarea
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </Field>
        <div className="form-row">
          <Field
            label="Max occupancy"
            help="The most guests (adults + children) allowed to stay in one room of this type."
          >
            <TextInput type="number" min="1" value={f.max_occupancy} onChange={num("max_occupancy")} />
          </Field>
          <Field
            label="Max adults"
            help="The most adults allowed in one room of this type, within the max occupancy."
          >
            <TextInput type="number" min="1" value={f.max_adults} onChange={num("max_adults")} />
          </Field>
          <Field
            label="Standard occupancy"
            help="The guest count a room of this type is priced and set up for by default. Extra guests may incur an additional-person charge."
          >
            <TextInput
              type="number"
              min="1"
              value={f.standard_occupancy}
              onChange={num("standard_occupancy")}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field
            label="Bed configuration"
            help="Free-text description of the beds, e.g. '1 queen' or '1 king + sofa bed'. Shown to staff and on booking screens."
          >
            <TextInput
              value={f.bed_configuration}
              onChange={(e) => setF({ ...f, bed_configuration: e.target.value })}
            />
          </Field>
          <Field
            label="Sort order"
            help="Controls the position of this room type in lists. Lower numbers appear first; ties break by code."
          >
            <TextInput type="number" value={f.sort_order} onChange={num("sort_order")} />
          </Field>
          <Field
            label="Overbooking allowance"
            help="Extra rooms of this type you allow to be sold beyond the physical room count, to absorb expected no-shows and cancellations. 0 = never oversell."
          >
            <TextInput
              type="number"
              min="0"
              value={f.overbooking_allowance}
              onChange={num("overbooking_allowance")}
            />
          </Field>
        </div>
        {roomType && (
          <label className="perm-item">
            <input
              type="checkbox"
              checked={f.is_active}
              onChange={(e) => setF({ ...f, is_active: e.target.checked })}
            />
            Active
          </label>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </Modal>
  );
}

// --------------------------------------------------------------------------- //
// Room views
// --------------------------------------------------------------------------- //

function ViewsTab() {
  const { can } = useAuth();
  const editable = can("inventory.manage");
  const toast = useToast();
  const property = useProperty();
  const currency = property.data?.currency ?? "AUD";
  const views = useAdminRoomViews();
  const actions = useRoomViewAdminActions();
  const [editing, setEditing] = useState<RoomView | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="page-head">
        <h2>Views</h2>
        <div className="spacer" />
        {editable && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            New view
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        Rooms can be tagged with a view (e.g. Garden, Ocean). A room's nightly surcharge is
        suggested whenever front desk offers a guest an upgrade into it at check-in.
      </p>

      <div className="card">
        {views.isLoading && <Spinner />}
        <ErrorText error={views.error} />
        {views.data && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th className="num-cell">Sort</th>
                  <th className="num-cell">Surcharge / night</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {views.data.map((rv) => (
                  <tr key={rv.id}>
                    <td>{rv.code}</td>
                    <td>{rv.name}</td>
                    <td className="num-cell">{rv.sort_order}</td>
                    <td className="num-cell">{formatMoney(rv.surcharge_minor, currency)}</td>
                    <td>
                      {rv.is_active ? (
                        "Active"
                      ) : (
                        <span className="badge badge-cancelled">Inactive</span>
                      )}
                    </td>
                    <td className="num-cell">
                      {editable && (
                        <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                          <button className="btn btn-sm" onClick={() => setEditing(rv)}>
                            Edit
                          </button>
                          {rv.is_active && (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => {
                                if (!window.confirm(`Deactivate ${rv.code}?`)) return;
                                actions.deactivate.mutate(rv.id, {
                                  onSuccess: () => toast.ok("Deactivated"),
                                  onError: toast.error,
                                });
                              }}
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <RoomViewModal
          roomView={editing}
          currency={currency}
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

function RoomViewModal({
  roomView,
  currency,
  busy,
  onClose,
  onSubmit,
}: {
  roomView: RoomView | null;
  currency: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
    code: roomView?.code ?? "",
    name: roomView?.name ?? "",
    sort_order: roomView?.sort_order ?? 100,
    is_active: roomView?.is_active ?? true,
  });
  const [surcharge, setSurcharge] = useState(
    roomView ? toMajorString(roomView.surcharge_minor, currency) : "0",
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      ...f,
      surcharge_minor: toMinor(surcharge || "0", currency),
    };
    if (roomView) delete body.code; // code is immutable after creation
    onSubmit(body);
  }

  return (
    <Modal title={roomView ? `Edit ${roomView.code}` : "New view"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          {!roomView && (
            <Field
              label="Code"
              hint="A–Z, 0–9, _"
              help="Short unique identifier for this view (e.g. OCEAN, GARDEN). Cannot be changed after creation."
            >
              <TextInput
                required
                pattern="[A-Z0-9_]{2,20}"
                value={f.code}
                onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })}
              />
            </Field>
          )}
          <Field label="Name" help="Guest-facing label for this view.">
            <TextInput
              required
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field
            label="Sort order"
            help="Ranks views by desirability — higher is better. Front desk only suggests an upgrade when the candidate room's view outranks the guest's current one."
          >
            <TextInput
              type="number"
              value={f.sort_order}
              onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })}
            />
          </Field>
          <Field
            label={`Surcharge / night (${currency})`}
            help="Suggested extra nightly charge when a guest is upgraded into a room with this view. Staff can override the amount at check-in."
          >
            <TextInput
              value={surcharge}
              onChange={(e) => setSurcharge(e.target.value)}
              inputMode="decimal"
            />
          </Field>
        </div>
        {roomView && (
          <label className="perm-item">
            <input
              type="checkbox"
              checked={f.is_active}
              onChange={(e) => setF({ ...f, is_active: e.target.checked })}
            />
            Active
          </label>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </Modal>
  );
}

// --------------------------------------------------------------------------- //
// Rooms
// --------------------------------------------------------------------------- //

function RoomsTab() {
  const { can } = useAuth();
  const editable = can("inventory.manage");
  const toast = useToast();

  const [q, setQ] = useState("");
  const [floor, setFloor] = useState("");
  const [roomTypeId, setRoomTypeId] = useState<number | undefined>();
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Room | null>(null);
  const [creating, setCreating] = useState(false);

  const isActive =
    activeFilter === "all" ? undefined : activeFilter === "active";
  const rooms = useAdminRooms({
    q,
    floor: floor || undefined,
    roomTypeId,
    isActive,
    offset: page * PAGE,
    limit: PAGE,
  });
  const types = useAdminRoomTypes();
  const views = useAdminRoomViews();
  const floors = useFloors();
  const actions = useRoomAdminActions();
  // Full room list (active only) for the adjoining-room picker, independent of paging/filters.
  const allRooms = useAdminRooms({ q: "", isActive: true, offset: 0, limit: 500 });
  const pages = rooms.data ? Math.ceil(rooms.data.total / PAGE) : 0;

  const typeName = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of types.data ?? []) m.set(t.id, t.code);
    return m;
  }, [types.data]);

  const items = rooms.data?.items ?? [];

  return (
    <>
      <div className="page-head">
        <h2>Rooms</h2>
        <div className="spacer" />
        {editable && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            New room
          </button>
        )}
      </div>

      <div className="card">
        <div className="form-row">
          <Field label="Search">
            <TextInput
              placeholder="Number or name"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </Field>
          <Field label="Floor">
            <Select
              value={floor}
              onChange={(e) => {
                setFloor(e.target.value);
                setPage(0);
              }}
              options={[["", "All floors"], ...(floors.data ?? []).map((f) => [f, f] as [string, string])]}
            />
          </Field>
          <Field label="Room type">
            <Select
              value={roomTypeId ? String(roomTypeId) : ""}
              onChange={(e) => {
                setRoomTypeId(e.target.value ? Number(e.target.value) : undefined);
                setPage(0);
              }}
              options={[
                ["", "All types"],
                ...(types.data ?? []).map((t) => [String(t.id), t.code] as [string, string]),
              ]}
            />
          </Field>
          <Field label="Status">
            <Select
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value as "all" | "active" | "inactive");
                setPage(0);
              }}
              options={[
                ["active", "Active"],
                ["inactive", "Inactive"],
                ["all", "All"],
              ]}
            />
          </Field>
        </div>
      </div>

      <div className="card">
        {rooms.isLoading && <Spinner />}
        <ErrorText error={rooms.error} />
        {items.length === 0 && !rooms.isLoading && <EmptyState>No rooms.</EmptyState>}
        {items.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>View</th>
                  <th>Adjoining</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {groupByFloor(items).map(([fl, group]) => (
                  <FloorGroup
                    key={fl || "—"}
                    floor={fl}
                    rooms={group}
                    typeName={typeName}
                    editable={editable}
                    onEdit={setEditing}
                    onDeactivate={(r) => {
                      if (!window.confirm(`Deactivate room ${r.number}?`)) return;
                      actions.deactivate.mutate(r.id, {
                        onSuccess: () => toast.ok("Room deactivated"),
                        onError: toast.error,
                      });
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} onPage={setPage} />
      </div>

      {(creating || editing) && (
        <RoomModal
          room={editing}
          types={types.data ?? []}
          views={views.data ?? []}
          adjoiningOptions={allRooms.data?.items ?? items}
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

function groupByFloor(rooms: Room[]): [string, Room[]][] {
  const m = new Map<string, Room[]>();
  for (const r of rooms) {
    const list = m.get(r.floor) ?? [];
    list.push(r);
    m.set(r.floor, list);
  }
  return [...m.entries()];
}

function FloorGroup({
  floor,
  rooms,
  typeName,
  editable,
  onEdit,
  onDeactivate,
}: {
  floor: string;
  rooms: Room[];
  typeName: Map<number, string>;
  editable: boolean;
  onEdit: (r: Room) => void;
  onDeactivate: (r: Room) => void;
}) {
  return (
    <>
      <tr className="group-row">
        <td colSpan={7}>Floor {floor || "—"}</td>
      </tr>
      {rooms.map((r) => (
        <tr key={r.id}>
          <td>{r.number}</td>
          <td>{r.name || "—"}</td>
          <td>{typeName.get(r.room_type_id) ?? r.room_type_id}</td>
          <td>{r.view_name ?? "—"}</td>
          <td>{r.adjoining_room_number ?? "—"}</td>
          <td>
            {r.is_active ? "Active" : <span className="badge badge-cancelled">Inactive</span>}
          </td>
          <td className="num-cell">
            {editable && (
              <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-sm" onClick={() => onEdit(r)}>
                  Edit
                </button>
                {r.is_active && (
                  <button className="btn btn-sm btn-danger" onClick={() => onDeactivate(r)}>
                    Deactivate
                  </button>
                )}
              </div>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

function RoomModal({
  room,
  types,
  views,
  adjoiningOptions,
  busy,
  onClose,
  onSubmit,
}: {
  room: Room | null;
  types: RoomType[];
  views: RoomView[];
  adjoiningOptions: Room[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
    number: room?.number ?? "",
    name: room?.name ?? "",
    floor: room?.floor ?? "",
    room_type_id: room?.room_type_id ?? types[0]?.id ?? 0,
    notes: room?.notes ?? "",
    is_active: room?.is_active ?? true,
  });
  const [viewId, setViewId] = useState<string>(room?.view_id ? String(room.view_id) : "");
  const [adjoining, setAdjoining] = useState<string>(
    room?.adjoining_room_id ? String(room.adjoining_room_id) : "",
  );

  useEffect(() => {
    setAdjoining(room?.adjoining_room_id ? String(room.adjoining_room_id) : "");
    setViewId(room?.view_id ? String(room.view_id) : "");
  }, [room]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      number: f.number,
      name: f.name,
      floor: f.floor,
      room_type_id: f.room_type_id,
      view_id: viewId ? Number(viewId) : null,
      notes: f.notes,
    };
    if (room) {
      body.is_active = f.is_active;
      body.adjoining_room_id = adjoining ? Number(adjoining) : null;
    }
    onSubmit(body);
  }

  return (
    <Modal title={room ? `Edit room ${room.number}` : "New room"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field
            label="Number"
            help="The room number as guests and staff know it. Must be unique across the property."
          >
            <TextInput
              required
              value={f.number}
              onChange={(e) => setF({ ...f, number: e.target.value })}
            />
          </Field>
          <Field label="Name" help="Optional label, e.g. 'Garden Suite' or 'Manager's flat'.">
            <TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field
            label="Floor"
            help="Free-text floor label (e.g. 'G', '1', 'Mezzanine'). Used to group and filter the room list."
          >
            <TextInput value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} />
          </Field>
        </div>
        <Field
          label="Room type"
          help="Determines pricing, capacity and availability for this room. Changing it re-classifies the physical room."
        >
          <Select
            value={String(f.room_type_id)}
            onChange={(e) => setF({ ...f, room_type_id: Number(e.target.value) })}
            options={types.map((t) => [String(t.id), `${t.code} — ${t.name}`])}
          />
        </Field>
        <Field
          label="View"
          help="Rooms with a better view are suggested at a higher price when front desk offers a check-in upgrade."
        >
          <Select
            value={viewId}
            onChange={(e) => setViewId(e.target.value)}
            options={[
              ["", "— none —"],
              ...views.map((v) => [String(v.id), v.name] as [string, string]),
            ]}
          />
        </Field>
        {room && (
          <Field
            label="Adjoining room"
            hint="Kept symmetric on the other room automatically"
            help="Marks two rooms as connecting (interior door). Setting one side automatically sets the other; clearing either clears both."
          >
            <Select
              value={adjoining}
              onChange={(e) => setAdjoining(e.target.value)}
              options={[
                ["", "— none —"],
                ...adjoiningOptions
                  .filter((r) => r.id !== room.id)
                  .map((r) => [String(r.id), `${r.number}`] as [string, string]),
              ]}
            />
          </Field>
        )}
        <Field label="Notes">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        {room && (
          <label className="perm-item">
            <input
              type="checkbox"
              checked={f.is_active}
              onChange={(e) => setF({ ...f, is_active: e.target.checked })}
            />
            Active
          </label>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </Modal>
  );
}
