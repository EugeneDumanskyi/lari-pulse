import { SessionProvider } from "@/components/auth/SessionProvider";
import { ReportsFoundation } from "@/components/reports/ReportsFoundation";
import { requirePageSession } from "@/lib/auth/pageGuard";

export default async function ReportsPage() {
  const session = await requirePageSession("/reports");

  return (
    <SessionProvider session={session}>
      <ReportsFoundation />
    </SessionProvider>
  );
}
