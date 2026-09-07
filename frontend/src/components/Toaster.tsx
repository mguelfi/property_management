import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Kind = "ok" | "error";
interface ToastAction {
  label: string;
  onClick: () => void;
}
interface Toast {
  id: number;
  kind: Kind;
  message: string;
  action?: ToastAction;
}

const ToastContext = createContext<(kind: Kind, message: string, action?: ToastAction) => void>(
  () => {},
);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: Kind, message: string, action?: ToastAction) => {
    const id = ++seq;
    setToasts((t) => [...t, { id, kind, message, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toaster">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role="status">
            {t.message}
            {t.action && (
              <button className="toast-action" onClick={t.action.onClick}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const push = useContext(ToastContext);
  return {
    ok: (m: string, action?: ToastAction) => push("ok", m, action),
    error: (e: unknown) => push("error", e instanceof Error ? e.message : String(e)),
  };
}
