import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditEvent } from "../api/types";
import { AuditActor, AuditEntity, AuditPayload, type RoomMap } from "./AuditView";

const rooms: RoomMap = new Map([
  [1, "101"],
  [2, "102"],
]);

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function ev(over: Partial<AuditEvent>): AuditEvent {
  return {
    id: 1,
    event_type: "X",
    actor_id: null,
    actor_username: null,
    entity_type: "",
    entity_id: null,
    occurred_at: "2026-08-30T09:00:00Z",
    payload: {},
    ...over,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("AuditActor", () => {
  it("shows the username, not the id", () => {
    wrap(<AuditActor ev={ev({ actor_id: 3, actor_username: "mike" })} />);
    expect(screen.getByText("mike")).toBeInTheDocument();
  });
  it("falls back to system when there is no actor", () => {
    wrap(<AuditActor ev={ev({})} />);
    expect(screen.getByText("system")).toBeInTheDocument();
  });
});

describe("AuditEntity", () => {
  it("links a reservation by its reference", () => {
    wrap(
      <AuditEntity
        ev={ev({ entity_type: "reservation", entity_id: 4, payload: { reference: "R000004" } })}
        rooms={rooms}
      />,
    );
    const link = screen.getByRole("link", { name: "R000004" });
    expect(link).toHaveAttribute("href", "/reservations/4");
  });
  it("resolves a room to its number", () => {
    wrap(<AuditEntity ev={ev({ entity_type: "room", entity_id: 2 })} rooms={rooms} />);
    expect(screen.getByText("102")).toBeInTheDocument();
  });
});

describe("AuditPayload", () => {
  it("dereferences room_ids and folds the reference into a reservation link", () => {
    wrap(
      <AuditPayload
        ev={ev({
          actor_id: 3,
          actor_username: "mike",
          payload: {
            reservation_id: 4,
            reference: "R000004",
            room_ids: [1, 2],
            actor_id: 3,
          },
        })}
        rooms={rooms}
      />,
    );
    // <details> renders its contents in jsdom regardless of open state
    expect(screen.getByRole("link", { name: "R000004" })).toHaveAttribute(
      "href",
      "/reservations/4",
    );
    expect(screen.getByText("101, 102")).toBeInTheDocument();
    expect(screen.getByText("mike")).toBeInTheDocument();
    expect(screen.queryByText("reference")).not.toBeInTheDocument(); // folded away
  });
});
