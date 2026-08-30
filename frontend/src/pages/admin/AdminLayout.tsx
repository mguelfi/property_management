import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

const SECTIONS: { to: string; label: string; codes: string[] }[] = [
  { to: "/admin/access", label: "Users & roles", codes: ["auth.manage_users", "auth.manage_roles"] },
  { to: "/admin/rooms", label: "Rooms", codes: ["inventory.manage", "inventory.view"] },
  { to: "/admin/rates", label: "Rates & tax", codes: ["rates.manage", "billing.manage_tax"] },
  { to: "/admin/property", label: "Property", codes: ["inventory.manage", "audit.view"] },
];

export function AdminLayout() {
  const { can } = useAuth();
  const visible = SECTIONS.filter((s) => s.codes.some((c) => can(c)));

  return (
    <>
      <h1>Administration</h1>
      <div className="subnav">
        {visible.map((s) => (
          <NavLink key={s.to} to={s.to} className="subnav-link">
            {s.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </>
  );
}
