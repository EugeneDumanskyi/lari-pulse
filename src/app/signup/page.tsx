import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { GlassPanel } from "@/components/dashboard/primitives";
import { pageInstanceStatus } from "@/lib/auth/pageGuard";
import { describeInvite } from "@/lib/services/accountService";

export default async function SignupPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const instance = await pageInstanceStatus();

  if (instance.needsSetup) {
    redirect("/setup");
  }

  const rawToken = (await searchParams).invite;
  const inviteToken = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const invite = inviteToken ? describeInvite(inviteToken) : null;
  const signInLink = (
    <>
      Already have an account?{" "}
      <Link className="font-semibold text-sky-100 hover:text-white" href="/login">
        Sign in
      </Link>
    </>
  );

  if (!invite && (inviteToken || instance.signupMode !== "open")) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 text-white">
        <GlassPanel className="w-full max-w-[440px] p-6 md:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/52">Sign-up</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            {inviteToken ? "This invite link is not valid" : "Sign-up is invite-only"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/62">
            {inviteToken
              ? "It may have expired or already been used. Ask an admin for a new link."
              : "Ask an admin of this LariPulse instance to send you an invite link."}
          </p>
          <div className="mt-5 text-sm text-white/56">{signInLink}</div>
        </GlassPanel>
      </main>
    );
  }

  return (
    <AuthForm
      footer={signInLink}
      inviteEmail={invite?.email}
      inviteRole={invite?.role}
      inviteToken={invite ? inviteToken : undefined}
      mode="signup"
    />
  );
}
