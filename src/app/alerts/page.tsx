import { SessionProvider } from "@/components/auth/SessionProvider";
import { AlertsFoundation } from "@/components/alerts/AlertsFoundation";
import { requirePageSession } from "@/lib/auth/pageGuard";

export default async function AlertsPage() {
  const session = await requirePageSession("/alerts", { minimumRole: "analyst" });

  return (
    <SessionProvider session={session}>
      <AlertsFoundation />
    </SessionProvider>
  );
}
