import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type UIThemeMode = "default" | "dense-kanban";

const STORAGE_KEY = "pms.uiTheme";

interface UIThemeValue {
  mode: UIThemeMode;
  isDense: boolean;
  toggle: () => void;
  setMode: (mode: UIThemeMode) => void;
}

const UIThemeContext = createContext<UIThemeValue | null>(null);

function readMode(): UIThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "dense-kanban" ? "dense-kanban" : "default";
  } catch {
    return "default";
  }
}

function writeMode(mode: UIThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* private mode: memory-only is fine */
  }
}

export function UIThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<UIThemeMode>(() => readMode());

  useEffect(() => {
    document.documentElement.setAttribute("data-ui-theme", mode === "dense-kanban" ? "dense" : "default");
  }, [mode]);

  const value = useMemo<UIThemeValue>(
    () => ({
      mode,
      isDense: mode === "dense-kanban",
      setMode: (next) => {
        setModeState(next);
        writeMode(next);
      },
      toggle: () => {
        setModeState((prev) => {
          const next = prev === "dense-kanban" ? "default" : "dense-kanban";
          writeMode(next);
          return next;
        });
      },
    }),
    [mode],
  );

  return <UIThemeContext.Provider value={value}>{children}</UIThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUITheme(): UIThemeValue {
  const ctx = useContext(UIThemeContext);
  if (!ctx) throw new Error("useUITheme must be used within <UIThemeProvider>");
  return ctx;
}
