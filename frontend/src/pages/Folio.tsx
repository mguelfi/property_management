import { Link, useParams } from "react-router-dom";
import { FolioPanel } from "../components/FolioPanel";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/ui";

/** Standalone folio view. The route param is the reservation id. */
export function FolioPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const rid = Number(id);

  if (!can("billing.view")) return <EmptyState>You don't have access to folios.</EmptyState>;

  return (
    <>
      <div className="page-head">
        <h1>Folio</h1>
        <div className="spacer" />
        <Link className="btn btn-sm" to={`/reservations/${rid}`}>
          Reservation
        </Link>
      </div>
      <FolioPanel reservationId={rid} />
    </>
  );
}
