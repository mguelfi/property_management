import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { setToken } from "../api/client";
import { AuthProvider } from "../auth/AuthContext";
import { RequireAuth } from "./RequireAuth";

function renderAt(path: string) {
  setToken(null);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: "/secret",
        element: (
          <RequireAuth>
            <div>secret content</div>
          </RequireAuth>
        ),
      },
      { path: "/login", element: <div>login page</div> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("RequireAuth", () => {
  it("redirects to /login when there is no token", async () => {
    renderAt("/secret");
    expect(await screen.findByText("login page")).toBeInTheDocument();
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
  });
});
