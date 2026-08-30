import type {
  ReactNode,
  SelectHTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import type { ReservationStatus } from "../api/types";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner-dot" /> {label}
    </div>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <p className="error-text" role="alert">
      {msg}
    </p>
  );
}

const STATUS_LABEL: Record<string, string> = {
  inquiry: "Inquiry",
  confirmed: "Confirmed",
  in_house: "In-house",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export function StatusBadge({ status }: { status: ReservationStatus | string }) {
  return (
    <span className={`badge badge-${status}`}>{STATUS_LABEL[status] ?? status}</span>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="input" rows={3} {...props} />;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: [string, string][];
  active: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="tabs">
      {tabs.map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`tab ${active === value ? "active" : ""}`}
          onClick={() => onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="btn-row" style={{ marginTop: 12 }}>
      <button className="btn btn-sm" disabled={page === 0} onClick={() => onPage(page - 1)}>
        ← Prev
      </button>
      <span className="muted" style={{ alignSelf: "center" }}>
        Page {page + 1} / {pages}
      </span>
      <button
        className="btn btn-sm"
        disabled={page + 1 >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next →
      </button>
    </div>
  );
}

export function Select({
  options,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { options: [string, string][] }) {
  return (
    <select className="input" {...props}>
      {options.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
