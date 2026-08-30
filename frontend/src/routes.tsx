import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { RequirePermission } from "./components/RequirePermission";
import { ADMIN_CODES } from "./auth/permissions";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Reservations } from "./pages/Reservations";
import { ReservationDetail } from "./pages/ReservationDetail";
import { NewBooking } from "./pages/NewBooking";
import { FrontDesk } from "./pages/FrontDesk";
import { FolioPage } from "./pages/Folio";
import { Guests } from "./pages/Guests";
import { GuestDetail } from "./pages/GuestDetail";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminAccess } from "./pages/admin/AdminAccess";
import { AdminRooms } from "./pages/admin/AdminRooms";
import { AdminRates } from "./pages/admin/AdminRates";
import { AdminProperty } from "./pages/admin/AdminProperty";

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: "reservations", element: <Reservations /> },
      { path: "reservations/:id", element: <ReservationDetail /> },
      { path: "book", element: <NewBooking /> },
      { path: "frontdesk", element: <FrontDesk /> },
      { path: "folio/:id", element: <FolioPage /> },
      { path: "guests", element: <Guests /> },
      { path: "guests/:id", element: <GuestDetail /> },
      {
        path: "admin",
        element: (
          <RequirePermission anyOf={ADMIN_CODES}>
            <AdminLayout />
          </RequirePermission>
        ),
        children: [
          { index: true, element: <Navigate to="access" replace /> },
          { path: "access", element: <AdminAccess /> },
          { path: "rooms", element: <AdminRooms /> },
          { path: "rates", element: <AdminRates /> },
          { path: "property", element: <AdminProperty /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
