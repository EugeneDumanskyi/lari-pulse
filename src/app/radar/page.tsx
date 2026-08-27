import { SessionProvider } from "@/components/auth/SessionProvider";
import { OpportunityRadarFoundation } from "@/components/radar/OpportunityRadarFoundation";
import { requirePageSession } from "@/lib/auth/pageGuard";

export default async function RadarPage() {
  const session = await requirePageSession("/radar");

  return (
    <SessionProvider session={session}>
      <OpportunityRadarFoundation />
    </SessionProvider>
  );
}
