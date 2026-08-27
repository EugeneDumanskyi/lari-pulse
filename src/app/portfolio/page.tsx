import { SessionProvider } from "@/components/auth/SessionProvider";
import { PortfolioFoundation } from "@/components/portfolio/PortfolioFoundation";
import { requirePageSession } from "@/lib/auth/pageGuard";

export default async function PortfolioPage() {
  const session = await requirePageSession("/portfolio", { minimumRole: "analyst" });

  return (
    <SessionProvider session={session}>
      <PortfolioFoundation />
    </SessionProvider>
  );
}
