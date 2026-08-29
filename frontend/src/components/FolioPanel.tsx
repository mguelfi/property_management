import { useState, type FormEvent } from "react";
import { useFolioActions, useFolioForReservation } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "./Toaster";
import { EmptyState, ErrorText, Field, Modal, Select, Spinner, TextInput } from "./ui";
import { fmtDateTime } from "../lib/dates";
import { formatMoney, toMinor } from "../lib/money";
import type { ChargeCategory, PaymentMethod } from "../api/types";

const CHARGE_CATEGORIES: [string, string][] = [
  ["room_service", "Room service"],
  ["food_beverage", "Food & beverage"],
  ["fee", "Fee"],
  ["misc", "Miscellaneous"],
  ["room", "Room"],
  ["deposit", "Deposit"],
];

const PAYMENT_METHODS: [string, string][] = [
  ["card_terminal", "Card terminal"],
  ["cash", "Cash"],
  ["bank_transfer", "Bank transfer"],
  ["ota_collected", "OTA collected"],
  ["voucher", "Voucher"],
  ["other", "Other"],
];

export function FolioPanel({ reservationId }: { reservationId: number }) {
  const { can } = useAuth();
  const toast = useToast();
  const folioQ = useFolioForReservation(reservationId);
  const folio = folioQ.data;
  const actions = useFolioActions(reservationId, folio?.id);
  const [modal, setModal] = useState<null | "charge" | "payment" | "invoice">(null);

  const canPost = can("billing.post");
  const canClose = can("billing.close");

  if (folioQ.isLoading) return <Spinner label="Loading folio…" />;
  if (folioQ.error) return <ErrorText error={folioQ.error} />;
  if (!folio) return <EmptyState>No folio.</EmptyState>;

  const currency = folio.currency;

  return (
    <div className="card">
      <div className="page-head">
        <h2>
          Folio {folio.code}{" "}
          <span className={`badge badge-${folio.status === "open" ? "confirmed" : "checked_out"}`}>
            {folio.status}
          </span>
        </h2>
        <div className="spacer" />
        {canPost && folio.status === "open" && (
          <>
            <button className="btn btn-sm" onClick={() => setModal("charge")}>
              Post charge
            </button>
            <button className="btn btn-sm" onClick={() => setModal("payment")}>
              Post payment
            </button>
          </>
        )}
        {canClose && (
          <button className="btn btn-sm" onClick={() => setModal("invoice")}>
            Invoice
          </button>
        )}
        {canClose && folio.status === "open" && folio.balance_minor === 0 && (
          <button
            className="btn btn-sm"
            onClick={() =>
              actions.close.mutate(undefined, {
                onSuccess: () => toast.ok("Folio closed"),
                onError: toast.error,
              })
            }
          >
            Close
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Posted</th>
              <th>Description</th>
              <th>Category</th>
              <th className="num-cell">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {folio.lines.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState>Nothing posted yet.</EmptyState>
                </td>
              </tr>
            )}
            {folio.lines.map((l) => (
              <tr key={l.id} style={l.is_void ? { opacity: 0.4, textDecoration: "line-through" } : undefined}>
                <td>{fmtDateTime(l.posted_at)}</td>
                <td>{l.description}</td>
                <td className="muted">{l.category}</td>
                <td className="num-cell">{formatMoney(l.amount_minor, currency)}</td>
                <td className="num-cell">
                  {canPost && folio.status === "open" && !l.is_void && l.kind !== "tax" && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const reason = prompt("Void reason?");
                        if (reason)
                          actions.voidLine.mutate(
                            { lineId: l.id, reason },
                            { onSuccess: () => toast.ok("Line voided"), onError: toast.error },
                          );
                      }}
                    >
                      Void
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={3}>Balance</th>
              <th className="num-cell">{formatMoney(folio.balance_minor, currency)}</th>
              <th />
            </tr>
          </tfoot>
        </table>
      </div>

      {modal === "charge" && (
        <ChargeModal
          currency={currency}
          busy={actions.postCharge.isPending}
          onClose={() => setModal(null)}
          onSubmit={(body) =>
            actions.postCharge.mutate(body, {
              onSuccess: () => {
                toast.ok("Charge posted");
                setModal(null);
              },
              onError: toast.error,
            })
          }
        />
      )}
      {modal === "payment" && (
        <PaymentModal
          currency={currency}
          balance={folio.balance_minor}
          busy={actions.postPayment.isPending}
          onClose={() => setModal(null)}
          onSubmit={(body) =>
            actions.postPayment.mutate(body, {
              onSuccess: () => {
                toast.ok("Payment recorded");
                setModal(null);
              },
              onError: toast.error,
            })
          }
        />
      )}
      {modal === "invoice" && (
        <InvoiceModal
          busy={actions.invoice.isPending}
          onClose={() => setModal(null)}
          onSubmit={(body) =>
            actions.invoice.mutate(body, {
              onSuccess: (inv) => {
                toast.ok(`Invoice ${inv.number} generated`);
                setModal(null);
              },
              onError: toast.error,
            })
          }
        />
      )}
    </div>
  );
}

function ChargeModal({
  currency,
  busy,
  onClose,
  onSubmit,
}: {
  currency: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (b: Record<string, unknown>) => void;
}) {
  const [category, setCategory] = useState<ChargeCategory>("room_service");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [qty, setQty] = useState("1");
  const [err, setErr] = useState<string>();

  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      onSubmit({
        category,
        description,
        amount_minor: toMinor(amount, currency),
        quantity: Number(qty) || 1,
      });
    } catch {
      setErr("Enter a valid amount");
    }
  }

  return (
    <Modal title="Post charge" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Category">
          <Select
            options={CHARGE_CATEGORIES}
            value={category}
            onChange={(e) => setCategory(e.target.value as ChargeCategory)}
          />
        </Field>
        <Field label="Description">
          <TextInput value={description} required onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="form-row">
          <Field label={`Unit amount (${currency})`} error={err}>
            <TextInput
              inputMode="decimal"
              value={amount}
              required
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Quantity">
            <TextInput
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </Field>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Posting…" : "Post charge"}
        </button>
      </form>
    </Modal>
  );
}

function PaymentModal({
  currency,
  balance,
  busy,
  onClose,
  onSubmit,
}: {
  currency: string;
  balance: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (b: Record<string, unknown>) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("card_terminal");
  const [amount, setAmount] = useState(
    balance > 0 ? (balance / 10 ** (currency === "JPY" ? 0 : 2)).toFixed(2) : "",
  );
  const [reference, setReference] = useState("");
  const [err, setErr] = useState<string>();

  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const amount_minor = toMinor(amount, currency);
      if (amount_minor <= 0) return setErr("Amount must be positive");
      onSubmit({ method, amount_minor, reference: reference || undefined });
    } catch {
      setErr("Enter a valid amount");
    }
  }

  return (
    <Modal title="Post payment" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Method">
          <Select
            options={PAYMENT_METHODS}
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          />
        </Field>
        <Field label={`Amount (${currency})`} error={err} hint={`Balance due: ${formatMoney(balance, currency)}`}>
          <TextInput
            inputMode="decimal"
            value={amount}
            required
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Reference (optional)">
          <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Record payment"}
        </button>
      </form>
    </Modal>
  );
}

function InvoiceModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (b: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  return (
    <Modal title="Generate invoice" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ bill_to_name: name, bill_to_address: address });
        }}
      >
        <Field label="Bill to (name)">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Bill to (address)">
          <TextInput value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Generating…" : "Generate"}
        </button>
      </form>
    </Modal>
  );
}
