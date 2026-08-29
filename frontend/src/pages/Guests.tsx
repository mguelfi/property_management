import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useCreateGuest, useGuestList } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toaster";
import { EmptyState, ErrorText, Field, Modal, Spinner, TextInput } from "../components/ui";

const PAGE = 25;

export function Guests() {
  const { can } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const { data, isLoading, error } = useGuestList(q, page * PAGE, PAGE);
  const createGuest = useCreateGuest();
  const pages = data ? Math.ceil(data.total / PAGE) : 0;

  return (
    <>
      <div className="page-head">
        <h1>Guests</h1>
        <div className="spacer" />
        {can("guests.manage") && (
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            Add guest
          </button>
        )}
      </div>

      <div className="card">
        <Field label="Search">
          <TextInput
            placeholder="Name, email or phone"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </Field>
      </div>

      <div className="card">
        {isLoading && <Spinner />}
        <ErrorText error={error} />
        {data?.items.length === 0 && <EmptyState>No guests.</EmptyState>}
        {data && data.items.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>City</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <Link to={`/guests/${g.id}`}>{g.full_name}</Link>
                    </td>
                    <td>{g.email ?? "—"}</td>
                    <td>{g.phone ?? "—"}</td>
                    <td>{g.city || "—"}</td>
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
              Page {page + 1} / {pages}
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

      {adding && (
        <AddGuestModal
          busy={createGuest.isPending}
          onClose={() => setAdding(false)}
          onSubmit={(body) =>
            createGuest.mutate(body, {
              onSuccess: () => {
                toast.ok("Guest added");
                setAdding(false);
              },
              onError: toast.error,
            })
          }
        />
      )}
    </>
  );
}

function AddGuestModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (b: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      first_name: f.first_name,
      last_name: f.last_name,
      email: f.email || undefined,
      phone: f.phone || undefined,
    });
  }
  return (
    <Modal title="Add guest" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="First name">
            <TextInput
              required
              value={f.first_name}
              onChange={(e) => setF({ ...f, first_name: e.target.value })}
            />
          </Field>
          <Field label="Last name">
            <TextInput
              required
              value={f.last_name}
              onChange={(e) => setF({ ...f, last_name: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Email">
          <TextInput type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Phone">
          <TextInput value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Add guest"}
        </button>
      </form>
    </Modal>
  );
}
