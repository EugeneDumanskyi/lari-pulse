import { SessionProvider } from "@/components/auth/SessionProvider";
import { InsightsFoundation } from "@/components/insights/InsightsFoundation";
import { requirePageSession } from "@/lib/auth/pageGuard";

export default async function InsightsPage() {
  const session = await requirePageSession("/insights");

  return (
    <SessionProvider session={session}>
      <InsightsFoundation />
    </SessionProvider>
  );
}
