// Thin fetch wrapper: injects the bearer token, normalises both backend error
// shapes ({error:{code,message}} and FastAPI's {detail:[...]}) into ApiError,
// and signals 401 so the auth layer can bounce to /login.

const TOKEN_KEY = "pms.token";

let token: string | null = readToken();
const listeners = new Set<() => void>();

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return token;
}

export function setToken(next: string | null): void {
  token = next;
  try {
    if (next) localStorage.setItem(TOKEN_KEY, next);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: memory-only is fine */
  }
  listeners.forEach((l) => l());
}

export function onAuthChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface Options {
  method?: string;
  body?: unknown;
  form?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const url = new URL(path, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.form).toString();
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, { method: opts.method ?? "GET", headers, body });

  if (res.status === 401) {
    setToken(null);
    throw new ApiError(401, "unauthorized", "Your session has expired. Please sign in again.");
  }
  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);
  if (!res.ok) throw toApiError(res.status, payload);
  return payload as T;
}

function toApiError(status: number, payload: unknown): ApiError {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (p.error && typeof p.error === "object") {
      const e = p.error as Record<string, unknown>;
      return new ApiError(status, String(e.code ?? "error"), String(e.message ?? "Request failed"));
    }
    if (Array.isArray(p.detail)) {
      const fields: Record<string, string> = {};
      for (const d of p.detail as Array<Record<string, unknown>>) {
        const loc = Array.isArray(d.loc) ? d.loc.slice(1).join(".") : "";
        if (loc) fields[loc] = String(d.msg ?? "invalid");
      }
      const first = Object.entries(fields)[0];
      return new ApiError(
        status,
        "validation_error",
        first ? `${first[0]}: ${first[1]}` : "Validation failed",
        fields,
      );
    }
    if (typeof p.detail === "string") {
      return new ApiError(status, "error", p.detail);
    }
  }
  return new ApiError(status, "error", `Request failed (${status})`);
}
