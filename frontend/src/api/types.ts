// Hand-written mirror of the backend schemas the UI consumes.
// Source of truth: GET /openapi.json  (regenerate by hand when the API changes).

export type ReservationStatus =
  | "inquiry"
  | "confirmed"
  | "in_house"
  | "checked_out"
  | "cancelled"
  | "no_show";

export type ReservationSource =
  | "direct"
  | "phone"
  | "walk_in"
  | "ota"
  | "travel_agent"
  | "other";

export type ChargeCategory =
  | "room"
  | "room_service"
  | "food_beverage"
  | "tax"
  | "deposit"
  | "fee"
  | "cancellation"
  | "misc";

export type PaymentMethod =
  | "cash"
  | "card_terminal"
  | "bank_transfer"
  | "ota_collected"
  | "voucher"
  | "other";

export interface Me {
  id: number;
  username: string;
  full_name: string;
  is_superuser: boolean;
  permissions: string[];
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface RoomType {
  id: number;
  code: string;
  name: string;
  description: string;
  max_occupancy: number;
  max_adults: number;
  standard_occupancy: number;
  bed_configuration: string;
  size_sqm: number | null;
  sort_order: number;
  is_active: boolean;
  overbooking_allowance: number;
}

export interface Room {
  id: number;
  number: string;
  name: string;
  floor: string;
  room_type_id: number;
  is_active: boolean;
  notes: string;
  adjoining_room_id: number | null;
  adjoining_room_number: string | null;
}

export interface RatePlanOffer {
  rate_plan_id: number;
  rate_plan_code: string;
  rate_plan_name: string;
  currency: string;
  total_minor: number;
  restrictions: string[];
  sellable: boolean;
}

export interface RoomTypeOffer {
  room_type_id: number;
  room_type_code: string;
  room_type_name: string;
  max_occupancy: number;
  units_available: number;
  rate_plans: RatePlanOffer[];
}

export interface NightRate {
  date: string;
  amount_minor: number;
}

export interface RateQuote {
  room_type_id: number;
  rate_plan_id: number;
  currency: string;
  arrival: string;
  departure: string;
  nights: NightRate[];
  total_minor: number;
}

export interface Company {
  id: number;
  name: string;
  is_travel_agent: boolean;
  commission_pct: string | null;
  tax_id: string;
  email: string;
  phone: string;
  billing_address: string;
  notes: string;
}

export interface Guest {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  nationality: string;
  city: string;
  country: string;
  company_id: number | null;
  marketing_consent: boolean;
  notes: string;
}

export interface GuestIn {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  nationality?: string;
  notes?: string;
}

export interface RoomLine {
  id: number;
  room_type_id: number;
  rate_plan_id: number;
  assigned_room_id: number | null;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  guest_name: string;
  rate_total_minor: number;
}

export interface Reservation {
  id: number;
  reference: string;
  status: ReservationStatus;
  source: ReservationSource;
  channel_name: string;
  external_reference: string;
  primary_guest_id: number;
  company_id: number | null;
  currency: string;
  arrival: string;
  departure: string;
  total_minor: number;
  cancellation_note: string;
  free_cancel_until: string | null;
  notes: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  cancelled_at: string | null;
  rooms: RoomLine[];
}

export interface ReservationListItem {
  id: number;
  reference: string;
  status: ReservationStatus;
  primary_guest_id: number;
  arrival: string;
  departure: string;
  total_minor: number;
  currency: string;
}

export interface RoomLineIn {
  room_type_id: number;
  rate_plan_id: number;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  guest_name?: string;
}

export interface ReservationCreate {
  primary_guest_id: number;
  company_id?: number | null;
  source?: ReservationSource;
  channel_name?: string;
  status?: ReservationStatus;
  notes?: string;
  rooms: RoomLineIn[];
}

export interface ArrivalRow {
  id: number;
  reference: string;
  primary_guest_id: number;
  arrival: string;
  departure: string;
  status: string;
  unassigned_rooms: number;
}

export interface FolioLine {
  id: number;
  kind: string;
  category: string;
  description: string;
  quantity: number;
  amount_minor: number;
  tax_component_minor: number;
  posted_at: string;
  source: string;
  reference: string;
  parent_line_id: number | null;
  is_void: boolean;
}

export interface Folio {
  id: number;
  reservation_id: number;
  code: string;
  status: string;
  currency: string;
  is_primary: boolean;
  lines: FolioLine[];
  balance_minor: number;
  gst_minor: number;
}

export interface Invoice {
  id: number;
  folio_id: number;
  number: string;
  issued_at: string;
  bill_to_name: string;
  bill_to_address: string;
  currency: string;
  total_minor: number;
  lines_json: Record<string, unknown>[];
}

export interface Property {
  id: number;
  name: string;
  legal_name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
  currency: string;
  timezone: string;
  phone: string;
  email: string;
  check_in_time: string;
  check_out_time: string;
}

// -- admin -------------------------------------------------------------- //

export interface Permission {
  code: string;
  description: string;
}

export interface Role {
  id: number;
  code: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export interface AdminUser {
  id: number;
  username: string;
  email: string | null;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  roles: Role[];
}

export interface PasswordResetResult {
  password: string | null;
}

export type BlockReason = "out_of_order" | "maintenance" | "hold" | "other";

export interface RoomBlock {
  id: number;
  room_id: number | null;
  room_type_id: number | null;
  units: number;
  start_date: string;
  end_date: string;
  reason: BlockReason;
  note: string;
}

export type MealPlan = "room_only" | "breakfast" | "half_board" | "full_board";
export type DerivedMode = "percent" | "amount";

export interface RatePlan {
  id: number;
  code: string;
  name: string;
  description: string;
  currency: string;
  meal_plan: MealPlan;
  is_active: boolean;
  is_derived: boolean;
  parent_rate_plan_id: number | null;
  derived_mode: DerivedMode | null;
  derived_value: string | null;
  free_cancel_until_days: number;
  cancellation_penalty_nights: number;
  cancellation_note: string;
  room_type_ids: number[];
}

export interface RateCalendarRow {
  date: string;
  room_type_id: number;
  rate_plan_id: number;
  amount_minor: number;
}

export interface RateRestrictionRow {
  date: string;
  room_type_id: number;
  rate_plan_id: number;
  min_stay: number;
  max_stay: number | null;
  closed: boolean;
  closed_to_arrival: boolean;
  closed_to_departure: boolean;
}

export interface TaxRule {
  id: number;
  name: string;
  percent: string | null;
  fixed_minor: number | null;
  applies_to_categories: string[];
  is_active: boolean;
  sort_order: number;
  tax_inclusive: boolean;
}

export type HousekeepingStatus = "clean" | "dirty" | "inspected" | "out_of_service";

export interface RoomHousekeepingRow {
  room_id: number;
  room_number: string;
  floor: string;
  room_type_id: number;
  status: HousekeepingStatus;
  updated_at: string | null;
  updated_by: number | null;
  note: string;
}

export type HousekeepingTaskStatus = "open" | "in_progress" | "done";

export interface HousekeepingTask {
  id: number;
  room_id: number;
  assigned_to: number | null;
  status: HousekeepingTaskStatus;
  description: string;
  created_by: number | null;
  completed_at: string | null;
}

export interface OccupancySummary {
  date: string;
  rooms_total: number;
  rooms_occupied: number;
  occupancy_pct: number;
}

export interface RevenueSummary {
  start: string;
  end: string;
  room_revenue_minor: number;
  room_nights_sold: number;
  adr_minor: number;
  revpar_minor: number;
  currency: string;
}

export interface ArrivalsDeparturesRow {
  date: string;
  arrivals: number;
  departures: number;
}

export interface NightAuditResult {
  as_of: string;
  night: string;
  charges_posted: number;
  no_shows_marked: number;
}

export interface AuditEvent {
  id: number;
  event_type: string;
  actor_id: number | null;
  actor_username: string | null;
  entity_type: string;
  entity_id: number | null;
  occurred_at: string;
  payload: Record<string, unknown>;
}
