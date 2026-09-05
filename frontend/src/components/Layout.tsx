import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ADMIN_CODES } from "../auth/permissions";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/frontdesk", label: "Front desk" },
  { to: "/housekeeping", label: "Housekeeping", perm: "housekeeping.view" },
  { to: "/reservations", label: "Reservations" },
  { to: "/book", label: "New booking" },
  { to: "/guests", label: "Guests" },
];

export function Layout() {
  const { me, logout, can } = useAuth();
  const navigate = useNavigate();
  const showAdmin = ADMIN_CODES.some((c) => can(c));
  const visibleNav = NAV.filter((n) => !n.perm || can(n.perm));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Front Desk</div>
        <nav>
          {visibleNav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              {n.label}
            </NavLink>
          ))}
          {showAdmin && (
            <NavLink to="/admin" className="nav-link">
              Admin
            </NavLink>
          )}
        </nav>
        <a className="nav-link nav-link-muted" href="/docs" target="_blank" rel="noreferrer">
          Admin API ↗
        </a>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-spacer" />
          <span className="user-name">{me?.full_name || me?.username}</span>
          <button
            className="btn btn-ghost"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Log out
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
