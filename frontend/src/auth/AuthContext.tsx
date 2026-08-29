import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken, onAuthChange, setToken } from "../api/client";
import type { Me, Token } from "../api/types";

interface AuthValue {
  me: Me | null;
  loading: boolean;
  isAuthed: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  can: (...codes: string[]) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [hasToken, setHasToken] = useState(() => !!getToken());

  useEffect(() => onAuthChange(() => setHasToken(!!getToken())), []);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/api/auth/me"),
    enabled: hasToken,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const value = useMemo<AuthValue>(() => {
    const me = hasToken ? (meQuery.data ?? null) : null;
    const perms = new Set(me?.permissions ?? []);
    return {
      me,
      loading: hasToken && meQuery.isLoading,
      isAuthed: !!me,
      can: (...codes) => !!me && (me.is_superuser || codes.every((c) => perms.has(c))),
      login: async (username, password) => {
        const tok = await api<Token>("/api/auth/login", {
          method: "POST",
          form: { username, password },
        });
        setToken(tok.access_token);
        await qc.invalidateQueries({ queryKey: ["me"] });
      },
      logout: () => {
        setToken(null);
        qc.clear();
      },
    };
  }, [hasToken, meQuery.data, meQuery.isLoading, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
