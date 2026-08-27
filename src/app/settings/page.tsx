import { SessionProvider } from "@/components/auth/SessionProvider";
import { SettingsFoundation } from "@/components/settings/SettingsFoundation";
import { requirePageSession } from "@/lib/auth/pageGuard";

export default async function SettingsPage() {
  const session = await requirePageSession("/settings", { signedIn: true });

  return (
    <SessionProvider session={session}>
      <SettingsFoundation />
    </SessionProvider>
  );
}
