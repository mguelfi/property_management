import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Spinner } from "./ui";

// Route-level permission gate. Button-level gating stays inline with `can(...)`.
export function RequirePermission({
  anyOf,
  allOf,
  children,
}: {
  anyOf?: readonly string[];
  allOf?: readonly string[];
  children: ReactNode;
}) {
  const { can, loading } = useAuth();
  if (loading) return <Spinner />;
  const ok = anyOf
    ? anyOf.some((c) => can(c))
    : (allOf ?? []).every((c) => can(c));
  if (!ok) return <Navigate to="/" replace />;
  return <>{children}</>;
}
