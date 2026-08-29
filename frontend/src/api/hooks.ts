import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  ArrivalRow,
  Folio,
  Guest,
  Invoice,
  Page,
  Property,
  RateQuote,
  Reservation,
  ReservationCreate,
  ReservationListItem,
  ReservationStatus,
  Room,
  RoomType,
  RoomTypeOffer,
} from "./types";

// -- inventory / property ------------------------------------------------- //

export const useProperty = () =>
  useQuery({ queryKey: ["property"], queryFn: () => api<Property>("/api/inventory/property"), staleTime: 60_000 });

export const useRooms = (roomTypeId?: number) =>
  useQuery({
    queryKey: ["rooms", roomTypeId ?? null],
    queryFn: () =>
      api<Room[]>("/api/inventory/rooms", { query: { room_type_id: roomTypeId } }),
    staleTime: 60_000,
  });

export const useRoomTypes = () =>
  useQuery({
    queryKey: ["room-types"],
    queryFn: () => api<RoomType[]>("/api/inventory/room-types"),
    staleTime: 5 * 60_000,
  });

export function useRoomTypeMap() {
  const { data } = useRoomTypes();
  return new Map((data ?? []).map((rt) => [rt.id, rt]));
}

// -- guests -------------------------------------------------------------- //

export const useGuest = (id: number | null | undefined) =>
  useQuery({
    queryKey: ["guest", id],
    queryFn: () => api<Guest>(`/api/guests/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });

export const useGuestSearch = (q: string) =>
  useQuery({
    queryKey: ["guests", q],
    queryFn: () => api<Page<Guest>>("/api/guests", { query: { q, limit: 20 } }),
    enabled: q.trim().length >= 2,
  });

export const useGuestList = (q: string, offset: number, limit: number) =>
  useQuery({
    queryKey: ["guest-list", q, offset, limit],
    queryFn: () => api<Page<Guest>>("/api/guests", { query: { q: q || undefined, offset, limit } }),
  });

export const useGuestDuplicates = (id: number) =>
  useQuery({
    queryKey: ["guest-dupes", id],
    queryFn: () => api<Guest[]>(`/api/guests/${id}/duplicates`),
  });

export function usePatchGuest(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Guest>(`/api/guests/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guest", id] });
      qc.invalidateQueries({ queryKey: ["guest-list"] });
    },
  });
}

// -- availability ------------------------------------------------------- //

export function useAvailability(params: {
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ["availability", params],
    queryFn: () =>
      api<RoomTypeOffer[]>("/api/availability", {
        query: {
          arrival: params.arrival,
          departure: params.departure,
          adults: params.adults,
          children: params.children,
        },
      }),
    enabled: params.enabled,
  });
}

export const quote = (q: {
  room_type_id: number;
  rate_plan_id: number;
  arrival: string;
  departure: string;
}) => api<RateQuote>("/api/availability/quote", { query: q });

// -- reservations ------------------------------------------------------ //

export function useReservations(filters: {
  status?: ReservationStatus | "";
  q?: string;
  guest_id?: number;
  arriving_on?: string;
  limit: number;
  offset: number;
}) {
  return useQuery({
    queryKey: ["reservations", filters],
    queryFn: () =>
      api<Page<ReservationListItem>>("/api/reservations", {
        query: { ...filters, status: filters.status || undefined },
      }),
  });
}

export const useReservation = (id: number) =>
  useQuery({ queryKey: ["reservation", id], queryFn: () => api<Reservation>(`/api/reservations/${id}`) });

export function useReservationAction(id: number) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["reservation", id] });
    qc.invalidateQueries({ queryKey: ["reservations"] });
    qc.invalidateQueries({ queryKey: ["frontdesk"] });
  };
  return {
    confirm: useMutation({
      mutationFn: () => api<Reservation>(`/api/reservations/${id}/confirm`, { method: "POST" }),
      onSuccess: invalidate,
    }),
    cancel: useMutation({
      mutationFn: (reason: string) =>
        api<Reservation>(`/api/reservations/${id}/cancel`, { method: "POST", body: { reason } }),
      onSuccess: invalidate,
    }),
    noShow: useMutation({
      mutationFn: () => api<Reservation>(`/api/reservations/${id}/no-show`, { method: "POST" }),
      onSuccess: invalidate,
    }),
  };
}

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReservationCreate) =>
      api<Reservation>("/api/reservations", { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["availability"] });
      qc.invalidateQueries({ queryKey: ["frontdesk"] });
    },
  });
}

export function useCreateGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Guest>("/api/guests", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guests"] }),
  });
}

// -- front desk ------------------------------------------------------- //

export const useFrontDeskBoard = (kind: "arrivals" | "departures" | "in-house", on?: string) =>
  useQuery({
    queryKey: ["frontdesk", kind, on ?? "today"],
    queryFn: () => api<ArrivalRow[]>(`/api/frontdesk/${kind}`, { query: { on } }),
    refetchInterval: 60_000,
  });

export function useFrontDeskActions() {
  const qc = useQueryClient();
  const invalidate = (reservationId?: number) => {
    qc.invalidateQueries({ queryKey: ["frontdesk"] });
    qc.invalidateQueries({ queryKey: ["reservations"] });
    if (reservationId) {
      qc.invalidateQueries({ queryKey: ["reservation", reservationId] });
      qc.invalidateQueries({ queryKey: ["folio", "reservation", reservationId] });
    }
  };
  return {
    assign: useMutation({
      mutationFn: (v: { reservationId: number; lineId: number; roomId: number }) =>
        api<Reservation>(
          `/api/frontdesk/reservations/${v.reservationId}/rooms/${v.lineId}/assign`,
          { method: "POST", body: { room_id: v.roomId } },
        ),
      onSuccess: (_d, v) => invalidate(v.reservationId),
    }),
    autoAssign: useMutation({
      mutationFn: (reservationId: number) =>
        api<Reservation>(`/api/frontdesk/reservations/${reservationId}/auto-assign`, {
          method: "POST",
        }),
      onSuccess: (_d, id) => invalidate(id),
    }),
    checkIn: useMutation({
      mutationFn: (reservationId: number) =>
        api<Reservation>(`/api/frontdesk/reservations/${reservationId}/checkin`, { method: "POST" }),
      onSuccess: (_d, id) => invalidate(id),
    }),
    checkOut: useMutation({
      mutationFn: (v: { reservationId: number; allowBalance: boolean }) =>
        api<Reservation>(`/api/frontdesk/reservations/${v.reservationId}/checkout`, {
          method: "POST",
          body: { allow_balance: v.allowBalance },
        }),
      onSuccess: (_d, v) => invalidate(v.reservationId),
    }),
    walkIn: useMutation({
      mutationFn: (body: ReservationCreate) =>
        api<{ reservation: Reservation; message: string }>("/api/frontdesk/walk-ins", {
          method: "POST",
          body,
        }),
      onSuccess: () => invalidate(),
    }),
  };
}

// -- billing / folio ------------------------------------------------- //

export const useFolioForReservation = (reservationId: number) =>
  useQuery({
    queryKey: ["folio", "reservation", reservationId],
    queryFn: () => api<Folio>(`/api/billing/reservations/${reservationId}/folio`),
  });

export function useFolioActions(reservationId: number, folioId: number | undefined) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["folio", "reservation", reservationId] });
    qc.invalidateQueries({ queryKey: ["reservation", reservationId] });
    qc.invalidateQueries({ queryKey: ["frontdesk"] });
  };
  return {
    postCharge: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<Folio>(`/api/billing/folios/${folioId}/charges`, { method: "POST", body }),
      onSuccess: invalidate,
    }),
    postPayment: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<Folio>(`/api/billing/folios/${folioId}/payments`, { method: "POST", body }),
      onSuccess: invalidate,
    }),
    voidLine: useMutation({
      mutationFn: (v: { lineId: number; reason: string }) =>
        api<Folio>(`/api/billing/lines/${v.lineId}/void`, {
          method: "POST",
          body: { reason: v.reason },
        }),
      onSuccess: invalidate,
    }),
    close: useMutation({
      mutationFn: () => api<Folio>(`/api/billing/folios/${folioId}/close`, { method: "POST" }),
      onSuccess: invalidate,
    }),
    invoice: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<Invoice>(`/api/billing/folios/${folioId}/invoice`, { method: "POST", body }),
      onSuccess: invalidate,
    }),
  };
}
