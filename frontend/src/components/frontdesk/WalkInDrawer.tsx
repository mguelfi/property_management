import { Drawer } from "../ui";
import { WalkInForm } from "./WalkInForm";

export function WalkInDrawer({ onClose }: { onClose: () => void }) {
  return (
    <Drawer title="Register walk-in" onClose={onClose}>
      <WalkInForm />
    </Drawer>
  );
}
