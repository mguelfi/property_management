import type { HousekeepingStatus } from "../api/types";

export const STATUS_LABEL: Record<HousekeepingStatus, string> = {
  clean: "Clean",
  dirty: "Dirty",
  inspected: "Inspected",
  out_of_service: "Out of service",
};

export const STATUS_OPTIONS: [string, string][] = [
  ["clean", "Clean"],
  ["dirty", "Dirty"],
  ["inspected", "Inspected"],
  ["out_of_service", "Out of service"],
];
