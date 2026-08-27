import { SessionProvider } from "@/components/auth/SessionProvider";
import { DashboardFoundation } from "@/components/dashboard/DashboardFoundation";
import { requirePageSession } from "@/lib/auth/pageGuard";

export default async function DashboardPage() {
  const session = await requirePageSession("/dashboard");

  return (
    <SessionProvider session={session}>
      <DashboardFoundation />
    </SessionProvider>
  );
}
