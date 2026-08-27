import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { currentPageSession, pageInstanceStatus, safeNextPath } from "@/lib/auth/pageGuard";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const instance = await pageInstanceStatus();
  const next = safeNextPath((await searchParams).next);

  if (instance.needsSetup) {
    redirect("/setup");
  }

  if ((await currentPageSession()).isAuthenticated) {
    redirect(next);
  }

  return (
    <AuthForm
      footer={
        <div className="space-y-2">
          {instance.signupMode === "open" ? (
            <div>
              No account yet?{" "}
              <Link className="font-semibold text-sky-100 hover:text-white" href="/signup">
                Create one
              </Link>
            </div>
          ) : null}
          {instance.publicDashboard ? (
            <div>
              <Link className="font-semibold text-sky-100 hover:text-white" href="/dashboard">
                Continue to the read-only dashboard
              </Link>
            </div>
          ) : null}
        </div>
      }
      mode="login"
      next={next}
    />
  );
}
