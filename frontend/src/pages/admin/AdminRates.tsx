import { useState, type FormEvent } from "react";
import {
  useAdminRoomTypes,
  useRateCalendar,
  useRateGridActions,
  useRatePlanAdminActions,
  useRatePlans,
  useRateRestrictions,
  useTaxRuleActions,
  useTaxRules,
} from "../../api/hooks";
import type { RatePlan, RoomType, TaxRule } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { addDaysISO, todayISO } from "../../lib/dates";
import { formatMoney, toMajorString, toMinor } from "../../lib/money";
import { useToast } from "../../components/Toaster";
import {
  EmptyState,
  ErrorText,
  Field,
  Modal,
  Select,
  Spinner,
  Tabs,
  Textarea,
  TextInput,
} from "../../components/ui";

const CATEGORIES = [
  "room",
  "room_service",
  "food_beverage",
  "fee",
  "upgrade",
  "misc",
];

export function AdminRates() {
  const { can } = useAuth();
  const canRates = can("rates.manage");
  const canTax = can("billing.manage_tax");
  const tabs: [string, string][] = [];
  if (canRates) {
    tabs.push(["plans", "Rate plans"], ["calendar", "Rate calendar"], ["restrictions", "Restrictions"]);
  }
  if (canTax) tabs.push(["tax", "Tax rules"]);
  const [tab, setTab] = useState(tabs[0]?.[0] ?? "tax");

  return (
    <>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === "plans" && canRates && <RatePlansTab />}
      {tab === "calendar" && canRates && <CalendarTab kind="calendar" />}
      {tab === "restrictions" && canRates && <CalendarTab kind="restrictions" />}
      {tab === "tax" && canTax && <TaxRulesTab />}
    </>
  );
}

// --------------------------------------------------------------------------- //
// Rate plans
// --------------------------------------------------------------------------- //

function RatePlansTab() {
  const toast = useToast();
  const plans = useRatePlans();
  const types = useAdminRoomTypes();
  const actions = useRatePlanAdminActions();
  const [editing, setEditing] = useState<RatePlan | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="page-head">
        <h2>Rate plans</h2>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          New rate plan
        </button>
      </div>

      <div className="card">
        {plans.isLoading && <Spinner />}
        <ErrorText error={plans.error} />
        {plans.data && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Meal plan</th>
                  <th>Derived</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plans.data.map((p) => (
                  <tr key={p.id}>
                    <td>{p.code}</td>
                    <td>{p.name}</td>
                    <td>{p.meal_plan}</td>
                    <td>{p.is_derived ? "yes" : "—"}</td>
                    <td>
                      {p.is_active ? "Active" : <span className="badge badge-cancelled">Inactive</span>}
                    </td>
                    <td className="num-cell">
                      <button className="btn btn-sm" onClick={() => setEditing(p)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <RatePlanModal
          plan={editing}
          plans={plans.data ?? []}
          types={types.data ?? []}
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

function RatePlanModal({
  plan,
  plans,
  types,
  busy,
  onClose,
  onSubmit,
}: {
  plan: RatePlan | null;
  plans: RatePlan[];
  types: RoomType[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
    code: plan?.code ?? "",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    currency: plan?.currency ?? "AUD",
    meal_plan: (plan?.meal_plan ?? "room_only") as string,
    is_active: plan?.is_active ?? true,
    parent_rate_plan_id: plan?.parent_rate_plan_id ?? null,
    derived_mode: plan?.derived_mode ?? null,
    derived_value: plan?.derived_value ?? "",
    cancellation_note: plan?.cancellation_note ?? "",
  });
  const [roomTypeIds, setRoomTypeIds] = useState<Set<number>>(
    new Set(plan?.room_type_ids ?? []),
  );

  const toggleRt = (id: number) =>
    setRoomTypeIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      name: f.name,
      description: f.description,
      meal_plan: f.meal_plan,
      is_active: f.is_active,
      room_type_ids: [...roomTypeIds],
      cancellation_note: f.cancellation_note,
      parent_rate_plan_id: f.parent_rate_plan_id,
      derived_mode: f.parent_rate_plan_id ? f.derived_mode : null,
      derived_value: f.parent_rate_plan_id ? f.derived_value || null : null,
    };
    if (!plan) {
      body.code = f.code;
      body.currency = f.currency;
    }
    onSubmit(body);
  }

  return (
    <Modal title={plan ? `Edit ${plan.code}` : "New rate plan"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          {!plan && (
            <Field
              label="Code"
              help="Short unique identifier for the rate plan (e.g. BAR, NONREF, CORP). Used in reports and channel connections. Cannot be changed after creation."
            >
              <TextInput
                required
                pattern="[A-Za-z0-9_-]{2,30}"
                value={f.code}
                onChange={(e) => setF({ ...f, code: e.target.value })}
              />
            </Field>
          )}
          <Field label="Name" help="Guest-facing name of the rate plan, e.g. 'Best Available Rate'.">
            <TextInput required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          {!plan && (
            <Field
              label="Currency"
              help="ISO currency code (3 letters) this plan is priced in. Must match the property currency to be bookable. Cannot be changed after creation."
            >
              <TextInput
                required
                maxLength={3}
                value={f.currency}
                onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })}
              />
            </Field>
          )}
        </div>
        <Field label="Description" help="Optional internal notes about when to use this plan.">
          <Textarea
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </Field>
        <Field
          label="Meal plan"
          help="What's included in the nightly price: room only, or room plus breakfast / half board (breakfast + dinner) / full board (all meals)."
        >
          <Select
            value={f.meal_plan}
            onChange={(e) => setF({ ...f, meal_plan: e.target.value })}
            options={[
              ["room_only", "Room only"],
              ["breakfast", "Breakfast"],
              ["half_board", "Half board"],
              ["full_board", "Full board"],
            ]}
          />
        </Field>
        <Field
          label="Room types"
          help="Which room types this rate plan can be sold for. A plan with no room types cannot be booked."
        >
          <div className="perm-grid">
            {types.map((t) => (
              <label key={t.id} className="perm-item">
                <input
                  type="checkbox"
                  checked={roomTypeIds.has(t.id)}
                  onChange={() => toggleRt(t.id)}
                />
                {t.code}
              </label>
            ))}
          </div>
        </Field>
        <Field
          label="Derived from"
          hint="Leave blank for a standalone plan"
          help="Base this plan's prices on another plan (e.g. NONREF = BAR minus 10%). Its rate calendar is calculated from the parent, not set directly."
        >
          <Select
            value={f.parent_rate_plan_id ? String(f.parent_rate_plan_id) : ""}
            onChange={(e) =>
              setF({
                ...f,
                parent_rate_plan_id: e.target.value ? Number(e.target.value) : null,
              })
            }
            options={[
              ["", "— none —"],
              ...plans
                .filter((p) => p.id !== plan?.id && !p.is_derived)
                .map((p) => [String(p.id), p.code] as [string, string]),
            ]}
          />
        </Field>
        {f.parent_rate_plan_id && (
          <div className="form-row">
            <Field
              label="Derived mode"
              help="'Percent' adjusts the parent price by a percentage; 'Fixed amount' adds or subtracts a set amount (in minor units, e.g. cents)."
            >
              <Select
                value={f.derived_mode ?? "percent"}
                onChange={(e) => setF({ ...f, derived_mode: e.target.value as "percent" | "amount" })}
                options={[
                  ["percent", "Percent"],
                  ["amount", "Fixed amount (minor units)"],
                ]}
              />
            </Field>
            <Field
              label="Derived value"
              help="The adjustment applied to the parent price. Negative discounts, positive marks up. Percent: -10 = 10% cheaper. Amount: -1000 = $10.00 less."
            >
              <TextInput
                value={f.derived_value ?? ""}
                onChange={(e) => setF({ ...f, derived_value: e.target.value })}
              />
            </Field>
          </div>
        )}
        <Field
          label="Cancellation note"
          help="Free-text cancellation policy shown to the guest and snapshotted onto each reservation at booking time."
        >
          <Textarea
            value={f.cancellation_note}
            onChange={(e) => setF({ ...f, cancellation_note: e.target.value })}
          />
        </Field>
        {plan && (
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
// Rate calendar / restrictions (shared shell)
// --------------------------------------------------------------------------- //

function CalendarTab({ kind }: { kind: "calendar" | "restrictions" }) {
  const toast = useToast();
  const plans = useRatePlans();
  const types = useAdminRoomTypes();
  const grid = useRateGridActions();

  const [planId, setPlanId] = useState<number | undefined>();
  const [rtId, setRtId] = useState<number | undefined>();
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(addDaysISO(todayISO(), 14));

  const calendar = useRateCalendar(kind === "calendar" ? planId : undefined, rtId, start, end);
  const restrictions = useRateRestrictions(
    kind === "restrictions" ? planId : undefined,
    rtId,
    start,
    end,
  );

  const [amount, setAmount] = useState("");
  const [minStay, setMinStay] = useState("1");
  const [closed, setClosed] = useState(false);
  const [closedToArrival, setClosedToArrival] = useState(false);
  const [closedToDeparture, setClosedToDeparture] = useState(false);

  const currency = plans.data?.find((p) => p.id === planId)?.currency ?? "AUD";

  function applyRange(e: FormEvent) {
    e.preventDefault();
    if (!planId || !rtId) return toast.error("Choose a plan and room type");
    if (kind === "calendar") {
      grid.setRates.mutate(
        {
          rate_plan_id: planId,
          room_type_id: rtId,
          start_date: start,
          end_date: end,
          amount_minor: toMinor(amount, currency),
        },
        { onSuccess: (r) => toast.ok(`Updated ${r.updated} night(s)`), onError: toast.error },
      );
    } else {
      grid.setRestrictions.mutate(
        {
          rate_plan_id: planId,
          room_type_id: rtId,
          start_date: start,
          end_date: end,
          min_stay: Number(minStay),
          closed,
          closed_to_arrival: closedToArrival,
          closed_to_departure: closedToDeparture,
        },
        { onSuccess: (r) => toast.ok(`Updated ${r.updated} night(s)`), onError: toast.error },
      );
    }
  }

  return (
    <>
      <div className="card">
        <div className="form-row">
          <Field label="Rate plan">
            <Select
              value={planId ? String(planId) : ""}
              onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : undefined)}
              options={[
                ["", "Choose…"],
                ...(plans.data ?? []).map((p) => [String(p.id), p.code] as [string, string]),
              ]}
            />
          </Field>
          <Field label="Room type">
            <Select
              value={rtId ? String(rtId) : ""}
              onChange={(e) => setRtId(e.target.value ? Number(e.target.value) : undefined)}
              options={[
                ["", "Choose…"],
                ...(types.data ?? []).map((t) => [String(t.id), t.code] as [string, string]),
              ]}
            />
          </Field>
          <Field label="From" help="First night of the range to view or edit (inclusive).">
            <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field
            label="To"
            hint="exclusive"
            help="Night after the last one you want to affect. A stay is [arrival, departure), so 'To' is the checkout date — that night is not included."
          >
            <TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="card">
        <h2>{kind === "calendar" ? "Set nightly rate" : "Set restriction"} for range</h2>
        <form onSubmit={applyRange}>
          <div className="form-row">
            {kind === "calendar" ? (
              <Field
                label={`Amount (${currency})`}
                help="Nightly price to apply to every night in the range, in major units (e.g. 150.00). This is the GST-inclusive sell price."
              >
                <TextInput
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="150.00"
                />
              </Field>
            ) : (
              <>
                <Field
                  label="Minimum stay"
                  help="Fewest nights a guest must book when arriving on a night in this range. 1 = no minimum."
                >
                  <TextInput
                    type="number"
                    min="1"
                    value={minStay}
                    onChange={(e) => setMinStay(e.target.value)}
                  />
                </Field>
                <label
                  className="perm-item"
                  style={{ alignSelf: "center" }}
                  title="When checked, this plan/room type cannot be sold at all for the nights in the range (no arrivals, no stay-throughs)."
                >
                  <input
                    type="checkbox"
                    checked={closed}
                    onChange={(e) => setClosed(e.target.checked)}
                  />
                  Closed
                </label>
                <label
                  className="perm-item"
                  style={{ alignSelf: "center" }}
                  title="Guests may not arrive on nights in this range (stay-throughs and departures still allowed)."
                >
                  <input
                    type="checkbox"
                    checked={closedToArrival}
                    onChange={(e) => setClosedToArrival(e.target.checked)}
                  />
                  Closed to arrival
                </label>
                <label
                  className="perm-item"
                  style={{ alignSelf: "center" }}
                  title="Guests may not depart on nights in this range."
                >
                  <input
                    type="checkbox"
                    checked={closedToDeparture}
                    onChange={(e) => setClosedToDeparture(e.target.checked)}
                  />
                  Closed to departure
                </label>
              </>
            )}
          </div>
          <button
            className="btn btn-primary"
            disabled={grid.setRates.isPending || grid.setRestrictions.isPending}
          >
            Apply to range
          </button>
        </form>
      </div>

      <div className="card">
        {kind === "calendar" ? (
          <RateList
            loading={calendar.isLoading}
            error={calendar.error}
            rows={(calendar.data ?? []).map((r) => ({
              date: r.date,
              value: formatMoney(r.amount_minor, currency),
            }))}
          />
        ) : (
          <RateList
            loading={restrictions.isLoading}
            error={restrictions.error}
            rows={(restrictions.data ?? []).map((r) => ({
              date: r.date,
              value: `min ${r.min_stay}${r.closed ? " · closed" : ""}${
                r.closed_to_arrival ? " · CTA" : ""
              }${r.closed_to_departure ? " · CTD" : ""}`,
            }))}
          />
        )}
      </div>
    </>
  );
}

function RateList({
  loading,
  error,
  rows,
}: {
  loading: boolean;
  error: unknown;
  rows: { date: string; value: string }[];
}) {
  if (loading) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (rows.length === 0) return <EmptyState>Nothing set for this range.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Date</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date}>
              <td>{r.date}</td>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Tax rules
// --------------------------------------------------------------------------- //

function TaxRulesTab() {
  const toast = useToast();
  const rules = useTaxRules();
  const actions = useTaxRuleActions();
  const [editing, setEditing] = useState<TaxRule | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="page-head">
        <h2>Tax rules</h2>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          New tax rule
        </button>
      </div>

      <div className="card">
        {rules.isLoading && <Spinner />}
        <ErrorText error={rules.error} />
        {rules.data && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Percent</th>
                  <th>Fixed</th>
                  <th>Mode</th>
                  <th>Categories</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rules.data.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.percent ? `${r.percent}%` : "—"}</td>
                    <td>{r.fixed_minor ?? "—"}</td>
                    <td className="muted">{r.tax_inclusive ? "inclusive" : "added on"}</td>
                    <td>{r.applies_to_categories.join(", ") || "all"}</td>
                    <td>
                      {r.is_active ? "Active" : <span className="badge badge-cancelled">Inactive</span>}
                    </td>
                    <td className="num-cell">
                      <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                        <button className="btn btn-sm" onClick={() => setEditing(r)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            if (!window.confirm(`Delete ${r.name}?`)) return;
                            actions.remove.mutate(r.id, {
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
        <TaxRuleModal
          rule={editing}
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

function TaxRuleModal({
  rule,
  busy,
  onClose,
  onSubmit,
}: {
  rule: TaxRule | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
    name: rule?.name ?? "",
    percent: rule?.percent ?? "",
    fixed: rule?.fixed_minor != null ? toMajorString(rule.fixed_minor, "AUD") : "",
    sort_order: rule?.sort_order ?? 100,
    is_active: rule?.is_active ?? true,
    tax_inclusive: rule?.tax_inclusive ?? true,
  });
  const [cats, setCats] = useState<Set<string>>(
    new Set(rule?.applies_to_categories ?? []),
  );
  const toggle = (c: string) =>
    setCats((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      name: f.name,
      percent: f.percent === "" ? null : f.percent,
      fixed_minor: f.fixed === "" ? null : toMinor(f.fixed, "AUD"),
      applies_to_categories: [...cats],
      sort_order: Number(f.sort_order),
      is_active: f.is_active,
      tax_inclusive: f.tax_inclusive,
    });
  }

  return (
    <Modal title={rule ? `Edit ${rule.name}` : "New tax rule"} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name" help="Label for the tax, shown on folios and invoices (e.g. GST).">
          <TextInput required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <div className="form-row">
          <Field
            label="Percent"
            hint="e.g. 10"
            help="Tax rate as a percentage. For a GST-inclusive rule this is the embedded rate — 10% means the GST portion of a price is amount ÷ 11."
          >
            <TextInput
              value={f.percent}
              onChange={(e) => setF({ ...f, percent: e.target.value })}
            />
          </Field>
          <Field
            label="Fixed amount"
            hint="major units, optional"
            help="A flat tax added per charge, on top of (or instead of) the percentage. Leave blank for percentage-only taxes."
          >
            <TextInput value={f.fixed} onChange={(e) => setF({ ...f, fixed: e.target.value })} />
          </Field>
          <Field
            label="Sort order"
            help="Order taxes are applied and listed in. Lower numbers first."
          >
            <TextInput
              type="number"
              value={f.sort_order}
              onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })}
            />
          </Field>
        </div>
        <Field
          label="Applies to"
          hint="none checked = all categories"
          help="Which charge categories this tax applies to. Leave all unchecked to apply it to every category."
        >
          <div className="perm-grid">
            {CATEGORIES.map((c) => (
              <label key={c} className="perm-item">
                <input type="checkbox" checked={cats.has(c)} onChange={() => toggle(c)} />
                {c}
              </label>
            ))}
          </div>
        </Field>
        <label
          className="perm-item"
          title="When checked, prices already include this tax (Australian GST style): the charge amount is what the guest pays and the tax portion is recorded for reporting only, not added on top. When unchecked, the tax is added as a separate line that increases the balance."
        >
          <input
            type="checkbox"
            checked={f.tax_inclusive}
            onChange={(e) => setF({ ...f, tax_inclusive: e.target.checked })}
          />
          Tax-inclusive pricing (prices already include this tax)
        </label>
        <label className="perm-item" title="Inactive tax rules are not applied to new charges.">
          <input
            type="checkbox"
            checked={f.is_active}
            onChange={(e) => setF({ ...f, is_active: e.target.checked })}
          />
          Active
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </Modal>
  );
}
