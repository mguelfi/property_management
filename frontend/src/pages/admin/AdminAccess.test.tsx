import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setToken } from "../../api/client";
import { AuthProvider } from "../../auth/AuthContext";
import { RequirePermission } from "../../components/RequirePermission";
import { ToastProvider } from "../../components/Toaster";
import { ADMIN_CODES } from "../../auth/permissions";
import { AdminAccess } from "./AdminAccess";

function stubApi(me: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const path = url.toString();
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      if (path.includes("/api/auth/me")) return json(me);
      if (path.includes("/api/auth/users")) {
        return json({
          items: [
            {
              id: 7,
              username: "grace",
              email: null,
              full_name: "Grace H",
              is_active: true,
              is_superuser: false,
              roles: [],
            },
          ],
          total: 1,
          limit: 20,
          offset: 0,
        });
      }
      if (path.includes("/api/auth/roles")) return json({ items: [], total: 0, limit: 200, offset: 0 });
      if (path.includes("/api/auth/permissions")) return json([]);
      return json({});
    }),
  );
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/", element: <div>home</div> },
      {
        path: "/admin/access",
        element: (
          <RequirePermission anyOf={ADMIN_CODES}>
            <AdminAccess />
          </RequirePermission>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  setToken(null);
});

describe("AdminAccess", () => {
  it("lists users for an admin", async () => {
    setToken("t");
    stubApi({
      id: 1,
      username: "boss",
      full_name: "Boss",
      is_superuser: false,
      permissions: ["auth.manage_users"],
    });
    renderAt("/admin/access");
    expect(await screen.findByText("grace")).toBeInTheDocument();
  });

  it("redirects a non-admin away", async () => {
    setToken("t");
    stubApi({
      id: 2,
      username: "clerk",
      full_name: "Clerk",
      is_superuser: false,
      permissions: ["guests.manage"],
    });
    renderAt("/admin/access");
    expect(await screen.findByText("home")).toBeInTheDocument();
  });
});
