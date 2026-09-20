import { SessionProvider } from "@/components/auth/SessionProvider";
import { WatchlistFoundation } from "@/components/watchlist/WatchlistFoundation";
import { requirePageSession } from "@/lib/auth/pageGuard";

export default async function WatchlistPage() {
  const session = await requirePageSession("/watchlist", { signedIn: true });

  return (
    <SessionProvider session={session}>
      <WatchlistFoundation />
    </SessionProvider>
  );
}
