import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  AdminUser,
  ArrivalRow,
  ArrivalsDeparturesRow,
  AuditEvent,
  Company,
  Folio,
  Guest,
  HousekeepingStatus,
  HousekeepingTask,
  HousekeepingTaskStatus,
  Invoice,
  NightAuditResult,
  OccupancySummary,
  Page,
  Permission,
  Property,
  RateCalendarRow,
  RatePlan,
  RateQuote,
  RateRestrictionRow,
  Reservation,
  ReservationCreate,
  ReservationListItem,
  ReservationStatus,
  RevenueSummary,
  Role,
  Room,
  RoomBlock,
  RoomHousekeepingRow,
  RoomLineIn,
  RoomType,
  RoomTypeOffer,
  TaxRule,
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

export const useCompanies = () =>
  useQuery({
    queryKey: ["companies"],
    queryFn: () => api<Company[]>("/api/guests/companies/"),
    staleTime: 60_000,
  });

export function useCompanyAdminActions() {
  const qc = useQueryClient();
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<Company>("/api/guests/companies/", { method: "POST", body }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
    }),
  };
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

export function useAmendReservation(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { rooms: RoomLineIn[] }) =>
      api<Reservation>(`/api/reservations/${id}/rooms`, { method: "PUT", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservation", id] });
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["availability"] });
    },
  });
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

// -- admin: users & roles ------------------------------------------------ //

export const useAdminUsers = (q: string, offset: number, limit: number) =>
  useQuery({
    queryKey: ["admin-users", q, offset, limit],
    queryFn: () =>
      api<Page<AdminUser>>("/api/auth/users", {
        query: { q: q || undefined, offset, limit },
      }),
  });

export const useAdminRoles = (q?: string) =>
  useQuery({
    queryKey: ["admin-roles", q ?? ""],
    queryFn: () =>
      api<Page<Role>>("/api/auth/roles", { query: { q: q || undefined, limit: 200 } }),
    staleTime: 60_000,
  });

export const usePermissions = () =>
  useQuery({
    queryKey: ["permissions"],
    queryFn: () => api<Permission[]>("/api/auth/permissions"),
    staleTime: 5 * 60_000,
  });

export function useUserAdminActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["me"] });
  };
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<AdminUser>("/api/auth/users", { method: "POST", body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (v: { id: number; body: Record<string, unknown> }) =>
        api<AdminUser>(`/api/auth/users/${v.id}`, { method: "PATCH", body: v.body }),
      onSuccess: invalidate,
    }),
    resetPassword: useMutation({
      mutationFn: (v: { id: number; password?: string }) =>
        api<{ password: string | null }>(`/api/auth/users/${v.id}/reset-password`, {
          method: "POST",
          body: { password: v.password || undefined },
        }),
    }),
    deactivate: useMutation({
      mutationFn: (id: number) =>
        api<void>(`/api/auth/users/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

export function useRoleAdminActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-roles"] });
    qc.invalidateQueries({ queryKey: ["permissions"] });
    qc.invalidateQueries({ queryKey: ["me"] });
  };
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<Role>("/api/auth/roles", { method: "POST", body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (v: { id: number; body: Record<string, unknown> }) =>
        api<Role>(`/api/auth/roles/${v.id}`, { method: "PATCH", body: v.body }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api<void>(`/api/auth/roles/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

// -- admin: rooms ------------------------------------------------------- //

export const useAdminRoomTypes = () =>
  useQuery({
    queryKey: ["admin-room-types"],
    queryFn: () =>
      api<RoomType[]>("/api/inventory/room-types", { query: { include_inactive: true } }),
    staleTime: 60_000,
  });

export const useAdminRooms = (f: {
  q: string;
  floor?: string;
  roomTypeId?: number;
  isActive?: boolean;
  offset: number;
  limit: number;
}) =>
  useQuery({
    queryKey: ["admin-rooms", f],
    queryFn: () =>
      api<Page<Room>>("/api/inventory/rooms/paginated", {
        query: {
          q: f.q || undefined,
          floor: f.floor || undefined,
          room_type_id: f.roomTypeId,
          is_active: f.isActive,
          offset: f.offset,
          limit: f.limit,
        },
      }),
  });

export const useFloors = () =>
  useQuery({
    queryKey: ["floors"],
    queryFn: () => api<string[]>("/api/inventory/rooms/floors"),
    staleTime: 60_000,
  });

export function useRoomTypeAdminActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-room-types"] });
    qc.invalidateQueries({ queryKey: ["room-types"] });
  };
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<RoomType>("/api/inventory/room-types", { method: "POST", body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (v: { id: number; body: Record<string, unknown> }) =>
        api<RoomType>(`/api/inventory/room-types/${v.id}`, { method: "PATCH", body: v.body }),
      onSuccess: invalidate,
    }),
    deactivate: useMutation({
      mutationFn: (id: number) =>
        api<void>(`/api/inventory/room-types/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

export function useRoomAdminActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-rooms"] });
    qc.invalidateQueries({ queryKey: ["rooms"] });
    qc.invalidateQueries({ queryKey: ["floors"] });
  };
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<Room>("/api/inventory/rooms", { method: "POST", body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (v: { id: number; body: Record<string, unknown> }) =>
        api<Room>(`/api/inventory/rooms/${v.id}`, { method: "PATCH", body: v.body }),
      onSuccess: invalidate,
    }),
    deactivate: useMutation({
      mutationFn: (id: number) => api<void>(`/api/inventory/rooms/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
    setAdjoining: useMutation({
      mutationFn: (v: { id: number; adjoining_room_id: number | null }) =>
        api<Room>(`/api/inventory/rooms/${v.id}`, {
          method: "PATCH",
          body: { adjoining_room_id: v.adjoining_room_id },
        }),
      onSuccess: invalidate,
    }),
  };
}

// -- admin: rates & tax ----------------------------------------------- //

export const useRatePlans = () =>
  useQuery({
    queryKey: ["rate-plans"],
    queryFn: () => api<RatePlan[]>("/api/rates/plans"),
    staleTime: 60_000,
  });

export const useRateCalendar = (
  planId: number | undefined,
  rtId: number | undefined,
  start: string,
  end: string,
) =>
  useQuery({
    queryKey: ["rate-calendar", planId, rtId, start, end],
    queryFn: () =>
      api<RateCalendarRow[]>("/api/rates/calendar", {
        query: { rate_plan_id: planId, room_type_id: rtId, start_date: start, end_date: end },
      }),
    enabled: !!planId && !!start && !!end,
  });

export const useRateRestrictions = (
  planId: number | undefined,
  rtId: number | undefined,
  start: string,
  end: string,
) =>
  useQuery({
    queryKey: ["rate-restrictions", planId, rtId, start, end],
    queryFn: () =>
      api<RateRestrictionRow[]>("/api/rates/restrictions", {
        query: { rate_plan_id: planId, room_type_id: rtId, start_date: start, end_date: end },
      }),
    enabled: !!planId && !!start && !!end,
  });

export const useTaxRules = () =>
  useQuery({
    queryKey: ["tax-rules"],
    queryFn: () => api<TaxRule[]>("/api/billing/tax-rules"),
    staleTime: 60_000,
  });

export function useRatePlanAdminActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["rate-plans"] });
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<RatePlan>("/api/rates/plans", { method: "POST", body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (v: { id: number; body: Record<string, unknown> }) =>
        api<RatePlan>(`/api/rates/plans/${v.id}`, { method: "PATCH", body: v.body }),
      onSuccess: invalidate,
    }),
  };
}

export function useRateGridActions() {
  const qc = useQueryClient();
  return {
    setRates: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<{ updated: number }>("/api/rates/calendar", { method: "PUT", body }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["rate-calendar"] }),
    }),
    setRestrictions: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<{ updated: number }>("/api/rates/restrictions", { method: "PUT", body }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["rate-restrictions"] }),
    }),
  };
}

export function useTaxRuleActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["tax-rules"] });
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<TaxRule>("/api/billing/tax-rules", { method: "POST", body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (v: { id: number; body: Record<string, unknown> }) =>
        api<TaxRule>(`/api/billing/tax-rules/${v.id}`, { method: "PATCH", body: v.body }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) =>
        api<void>(`/api/billing/tax-rules/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

// -- admin: property, blocks, audit --------------------------------- //

export function usePropertyActions() {
  const qc = useQueryClient();
  return {
    update: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<Property>("/api/inventory/property", { method: "PATCH", body }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["property"] }),
    }),
  };
}

export const useAdminBlocks = () =>
  useQuery({
    queryKey: ["blocks"],
    queryFn: () => api<RoomBlock[]>("/api/inventory/blocks"),
  });

export function useBlockAdminActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["blocks"] });
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<RoomBlock>("/api/inventory/blocks", { method: "POST", body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (v: { id: number; body: Record<string, unknown> }) =>
        api<RoomBlock>(`/api/inventory/blocks/${v.id}`, { method: "PATCH", body: v.body }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api<void>(`/api/inventory/blocks/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

// -- housekeeping -------------------------------------------------------- //

export const useHousekeepingBoard = (f: { floor?: string; status?: HousekeepingStatus | "" }) =>
  useQuery({
    queryKey: ["housekeeping-board", f],
    queryFn: () =>
      api<RoomHousekeepingRow[]>("/api/housekeeping/board", {
        query: { floor: f.floor || undefined, status: f.status || undefined },
      }),
    refetchInterval: 60_000,
  });

export function useHousekeepingActions() {
  const qc = useQueryClient();
  return {
    setStatus: useMutation({
      mutationFn: (v: { roomId: number; status: HousekeepingStatus; note?: string }) =>
        api<RoomHousekeepingRow>(`/api/housekeeping/rooms/${v.roomId}/status`, {
          method: "POST",
          body: { status: v.status, note: v.note ?? "" },
        }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["housekeeping-board"] }),
    }),
  };
}

export const useHousekeepingTasks = (status?: HousekeepingTaskStatus | "") =>
  useQuery({
    queryKey: ["housekeeping-tasks", status ?? ""],
    queryFn: () =>
      api<HousekeepingTask[]>("/api/housekeeping/tasks", { query: { status: status || undefined } }),
  });

export function useHousekeepingTaskActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["housekeeping-tasks"] });
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<HousekeepingTask>("/api/housekeeping/tasks", { method: "POST", body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (v: { id: number; body: Record<string, unknown> }) =>
        api<HousekeepingTask>(`/api/housekeeping/tasks/${v.id}`, {
          method: "PATCH",
          body: v.body,
        }),
      onSuccess: invalidate,
    }),
  };
}

// -- reports & night audit ------------------------------------------------ //

export const useOccupancyReport = (start: string, end: string) =>
  useQuery({
    queryKey: ["report-occupancy", start, end],
    queryFn: () =>
      api<OccupancySummary[]>("/api/reports/occupancy", { query: { start, end } }),
    enabled: !!start && !!end,
  });

export const useRevenueReport = (start: string, end: string) =>
  useQuery({
    queryKey: ["report-revenue", start, end],
    queryFn: () => api<RevenueSummary>("/api/reports/revenue", { query: { start, end } }),
    enabled: !!start && !!end,
  });

export const useArrivalsDeparturesReport = (start: string, end: string) =>
  useQuery({
    queryKey: ["report-arrdep", start, end],
    queryFn: () =>
      api<ArrivalsDeparturesRow[]>("/api/reports/arrivals-departures", {
        query: { start, end },
      }),
    enabled: !!start && !!end,
  });

export function useNightAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (as_of?: string) =>
      api<NightAuditResult>("/api/frontdesk/night-audit", { method: "POST", body: { as_of } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-events"] });
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["frontdesk"] });
      qc.invalidateQueries({ queryKey: ["report-revenue"] });
      qc.invalidateQueries({ queryKey: ["report-occupancy"] });
    },
  });
}

export const useAuditEvents = (f: {
  entity_type?: string;
  entity_id?: number;
  event_type?: string;
  offset: number;
  limit: number;
}) =>
  useQuery({
    queryKey: ["audit-events", f],
    queryFn: () =>
      api<Page<AuditEvent>>("/api/audit/events", {
        query: {
          entity_type: f.entity_type || undefined,
          entity_id: f.entity_id,
          event_type: f.event_type || undefined,
          offset: f.offset,
          limit: f.limit,
        },
      }),
  });
