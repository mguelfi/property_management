// Permission codes that unlock the Admin section. Holding any one of these shows
// the "Admin" nav entry and grants access to the admin routes; individual
// sub-pages still gate on their own specific code.
export const ADMIN_CODES = [
  "auth.manage_users",
  "auth.manage_roles",
  "inventory.manage",
  "rates.manage",
  "billing.manage_tax",
  "audit.view",
  "reports.view",
] as const;
