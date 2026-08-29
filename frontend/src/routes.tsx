import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Reservations } from "./pages/Reservations";
import { ReservationDetail } from "./pages/ReservationDetail";
import { NewBooking } from "./pages/NewBooking";
import { FrontDesk } from "./pages/FrontDesk";
import { FolioPage } from "./pages/Folio";
import { Guests } from "./pages/Guests";
import { GuestDetail } from "./pages/GuestDetail";

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
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
