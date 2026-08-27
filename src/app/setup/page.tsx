import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { pageInstanceStatus } from "@/lib/auth/pageGuard";

export default async function SetupPage() {
  if (!(await pageInstanceStatus()).needsSetup) {
    redirect("/login");
  }

  return <AuthForm mode="setup" />;
}
