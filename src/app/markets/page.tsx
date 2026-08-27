import { SessionProvider } from "@/components/auth/SessionProvider";
import { MarketsFoundation } from "@/components/markets/MarketsFoundation";
import { requirePageSession } from "@/lib/auth/pageGuard";

export default async function MarketsPage() {
  const session = await requirePageSession("/markets");

  return (
    <SessionProvider session={session}>
      <MarketsFoundation />
    </SessionProvider>
  );
}
