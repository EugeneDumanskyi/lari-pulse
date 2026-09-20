import { SessionProvider } from "@/components/auth/SessionProvider";
import { ScansFoundation } from "@/components/scans/ScansFoundation";
import { requirePageSession } from "@/lib/auth/pageGuard";

export default async function ScansPage() {
  const session = await requirePageSession("/scans");

  return (
    <SessionProvider session={session}>
      <ScansFoundation />
    </SessionProvider>
  );
}
