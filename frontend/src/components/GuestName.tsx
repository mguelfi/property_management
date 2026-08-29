import { Link } from "react-router-dom";
import { useGuest } from "../api/hooks";

export function GuestName({ id, link = true }: { id: number; link?: boolean }) {
  const { data, isLoading } = useGuest(id);
  const name = isLoading ? "…" : (data?.full_name ?? `Guest #${id}`);
  return link ? <Link to={`/guests/${id}`}>{name}</Link> : <>{name}</>;
}
