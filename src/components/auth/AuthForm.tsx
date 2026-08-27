"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import { LariPulseLogo } from "@/components/brand/LariPulseLogo";
import { GlassPanel } from "@/components/dashboard/primitives";

type AuthMode = "login" | "setup" | "signup";

const copy: Record<AuthMode, { eyebrow: string; title: string; description: string; submit: string; endpoint: string }> = {
  login: {
    eyebrow: "Welcome back",
    title: "Sign in",
    description: "Use the account your LariPulse admin created or invited you to.",
    submit: "Sign in",
    endpoint: "/api/auth/login"
  },
  setup: {
    eyebrow: "First run",
    title: "Create the admin account",
    description: "This instance has no users yet. The account you create here becomes its first admin.",
    submit: "Create admin and continue",
    endpoint: "/api/auth/setup"
  },
  signup: {
    eyebrow: "Join this instance",
    title: "Create your account",
    description: "Choose the email and password you will use to sign in.",
    submit: "Create account",
    endpoint: "/api/auth/signup"
  }
};

const inputClass =
  "h-12 w-full rounded-2xl border border-white/18 bg-white/90 px-4 text-sm font-medium text-slate-950 caret-sky-600 outline-none transition placeholder:text-slate-500 focus:border-sky-200/50 focus:bg-white";

export function AuthForm({
  mode,
  next = "/dashboard",
  inviteToken,
  inviteEmail,
  inviteRole,
  footer
}: {
  mode: AuthMode;
  next?: string;
  inviteToken?: string;
  inviteEmail?: string | null;
  inviteRole?: string | null;
  footer?: React.ReactNode;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(inviteEmail ?? "");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = copy[mode];
  const Icon = mode === "login" ? LogIn : mode === "setup" ? ShieldCheck : UserPlus;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(text.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, inviteToken })
      });
      const body = (await response.json().catch(() => null)) as { status: string; message?: string } | null;

      if (!response.ok || body?.status !== "ok") {
        throw new Error(body?.message ?? "Request failed");
      }

      router.replace(mode === "setup" ? "/settings" : next);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Request failed");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 text-white">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[440px]"
        initial={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <div className="mb-6 flex justify-center">
          <LariPulseLogo />
        </div>
        <GlassPanel className="p-6 md:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/52">{text.eyebrow}</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">{text.title}</h1>
          <p className="mt-2 text-sm leading-6 text-white/62">{text.description}</p>
          {inviteRole ? (
            <p className="mt-3 rounded-2xl border border-sky-200/20 bg-sky-200/10 px-4 py-2 text-sm text-sky-50">
              You were invited as <span className="font-semibold capitalize">{inviteRole}</span>.
            </p>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-white/54">Email</span>
              <input
                autoComplete="email"
                autoFocus={!inviteEmail}
                className={inputClass}
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                readOnly={Boolean(inviteEmail)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-white/54">Password</span>
              <input
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className={inputClass}
                minLength={mode === "login" ? undefined : 8}
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
              {mode !== "login" ? <span className="mt-1 block text-xs text-white/46">At least 8 characters.</span> : null}
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-300/35 bg-rose-500/12 px-4 py-3 text-sm text-rose-100" role="alert">
                {error}
              </div>
            ) : null}

            <button
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-sky-200/24 bg-sky-200/16 text-sm font-semibold text-sky-50 transition hover:bg-sky-200/22 disabled:opacity-55"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
              {text.submit}
            </button>
          </form>

          {footer ? <div className="mt-5 text-center text-sm text-white/56">{footer}</div> : null}
        </GlassPanel>
      </motion.div>
    </main>
  );
}
