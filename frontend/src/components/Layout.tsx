import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/frontdesk", label: "Front desk" },
  { to: "/reservations", label: "Reservations" },
  { to: "/book", label: "New booking" },
  { to: "/guests", label: "Guests" },
];

export function Layout() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Front Desk</div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              {n.label}
            </NavLink>
          ))}
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
