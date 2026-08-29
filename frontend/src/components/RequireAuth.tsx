import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getToken } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Spinner } from "./ui";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthed, loading } = useAuth();
  const location = useLocation();

  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (loading) return <Spinner label="Signing in…" />;
  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
