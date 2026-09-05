import { useState, type FormEvent } from "react";
import { useCompanies, useCompanyAdminActions } from "../../api/hooks";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toaster";
import { EmptyState, ErrorText, Field, Modal, Spinner, TextInput } from "../../components/ui";

export function AdminCompanies() {
  const { can } = useAuth();
  const editable = can("guests.manage");
  const toast = useToast();
  const companies = useCompanies();
  const actions = useCompanyAdminActions();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="page-head">
        <h2>Companies</h2>
        <div className="spacer" />
        {editable && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            New company
          </button>
        )}
      </div>

      <div className="card">
        {companies.isLoading && <Spinner />}
        <ErrorText error={companies.error} />
        {(companies.data ?? []).length === 0 && !companies.isLoading && (
          <EmptyState>No companies yet.</EmptyState>
        )}
        {(companies.data ?? []).length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Travel agent</th>
                  <th className="num-cell">Commission %</th>
                  <th>Tax ID</th>
                </tr>
              </thead>
              <tbody>
                {(companies.data ?? []).map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.is_travel_agent ? "Yes" : "—"}</td>
                    <td className="num-cell">{c.commission_pct ?? "—"}</td>
                    <td>{c.tax_id || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <CompanyModal
          busy={actions.create.isPending}
          onClose={() => setCreating(false)}
          onSubmit={(body) =>
            actions.create.mutate(body, {
              onSuccess: () => {
                toast.ok("Company created");
                setCreating(false);
              },
              onError: toast.error,
            })
          }
        />
      )}
    </>
  );
}

function CompanyModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
    name: "",
    is_travel_agent: false,
    commission_pct: "",
    tax_id: "",
    email: "",
    phone: "",
    billing_address: "",
    notes: "",
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      ...f,
      commission_pct: f.commission_pct ? Number(f.commission_pct) : null,
    });
  }

  return (
    <Modal title="New company" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name">
          <TextInput
            required
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </Field>
        <div className="form-row">
          <Field label="Tax ID">
            <TextInput value={f.tax_id} onChange={(e) => setF({ ...f, tax_id: e.target.value })} />
          </Field>
          <Field label="Commission %" help="Only relevant for travel agents.">
            <TextInput
              type="number"
              min="0"
              max="100"
              value={f.commission_pct}
              onChange={(e) => setF({ ...f, commission_pct: e.target.value })}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Email">
            <TextInput
              type="email"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <TextInput value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
        </div>
        <Field label="Billing address">
          <TextInput
            value={f.billing_address}
            onChange={(e) => setF({ ...f, billing_address: e.target.value })}
          />
        </Field>
        <label className="perm-item">
          <input
            type="checkbox"
            checked={f.is_travel_agent}
            onChange={(e) => setF({ ...f, is_travel_agent: e.target.checked })}
          />
          Travel agent
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </Modal>
  );
}
