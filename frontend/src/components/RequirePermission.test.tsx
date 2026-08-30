import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setToken } from "../api/client";
import { AuthProvider } from "../auth/AuthContext";
import { RequirePermission } from "./RequirePermission";

function mockMe(permissions: string[], is_superuser = false) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 1,
          username: "u",
          full_name: "U",
          is_superuser,
          permissions,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
}

function renderGuarded() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/", element: <div>home</div> },
      {
        path: "/admin",
        element: (
          <RequirePermission anyOf={["auth.manage_users"]}>
            <div>admin content</div>
          </RequirePermission>
        ),
      },
    ],
    { initialEntries: ["/admin"] },
  );
  render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  setToken(null);
});

describe("RequirePermission", () => {
  it("renders children when the user holds a required code", async () => {
    setToken("t");
    mockMe(["auth.manage_users"]);
    renderGuarded();
    expect(await screen.findByText("admin content")).toBeInTheDocument();
  });

  it("redirects when the user lacks every required code", async () => {
    setToken("t");
    mockMe(["guests.manage"]);
    renderGuarded();
    expect(await screen.findByText("home")).toBeInTheDocument();
    expect(screen.queryByText("admin content")).not.toBeInTheDocument();
  });
});
