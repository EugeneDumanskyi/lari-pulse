"use client";

import { useEffect, useState } from "react";
import { Check, Eye, Lock, LogIn, LogOut, Save, Settings } from "lucide-react";
import { motion } from "framer-motion";
import type {
  ApiEnvelope,
  AuthSessionApi,
  WidgetCatalogItemApi,
  WidgetSettingsApi
} from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { replaceIsoDatesWithLocalTime } from "@/lib/utils/formatDateTime";
import { AppShell, GlassPanel, StatusBadge } from "@/components/dashboard/primitives";

async function fetchApi<T>(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  const body = (await response.json()) as ApiEnvelope<T> | { status: "error"; message: string };

  if (!response.ok || body.status === "error") {
    throw new Error("message" in body ? body.message : `Request failed: ${url}`);
  }

  return body.data;
}

function groupCatalog(catalog: WidgetCatalogItemApi[], group: WidgetCatalogItemApi["group"]) {
  return catalog.filter((item) => item.group === group).sort((left, right) => left.priority - right.priority);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function SettingsFoundation() {
  const [authSession, setAuthSession] = useState<AuthSessionApi | null>(null);
  const [settingsState, setSettingsState] = useState<WidgetSettingsApi | null>(null);
  const [enabledWidgetIds, setEnabledWidgetIds] = useState<string[]>([]);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);

  async function loadSettings(signal?: AbortSignal) {
    const [sessionData, settingsData] = await Promise.all([
      fetchApi<AuthSessionApi>("/api/auth/session", signal),
      fetchApi<WidgetSettingsApi>("/api/settings/widgets", signal)
    ]);

    setAuthSession(sessionData);
    setSettingsState(settingsData);
    setEnabledWidgetIds(settingsData.enabledWidgetIds);

    return settingsData;
  }

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);
      setPanelError(null);
      setMessage(null);

      try {
        await loadSettings(controller.signal);
      } catch (settingsError) {
        if (!controller.signal.aborted && !isAbortError(settingsError)) {
          setPanelError(settingsError instanceof Error ? settingsError.message : "Unable to load settings");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, []);

  async function login() {
    setIsSaving(true);
    setPanelError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });
      const body = (await response.json()) as ApiEnvelope<AuthSessionApi> | { status: "error"; message: string };

      if (!response.ok || body.status === "error") {
        throw new Error("message" in body ? body.message : "Unable to sign in");
      }

      setAuthSession(body.data);
      setPassword("");
      await loadSettings();
      setMessage("Enterprise access unlocked.");
    } catch (loginError) {
      setPanelError(loginError instanceof Error ? loginError.message : "Unable to sign in");
    } finally {
      setIsSaving(false);
    }
  }

  async function logout() {
    setIsSaving(true);
    setPanelError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const body = (await response.json()) as ApiEnvelope<AuthSessionApi> | { status: "error"; message: string };

      if (!response.ok || body.status === "error") {
        throw new Error("message" in body ? body.message : "Unable to sign out");
      }

      setAuthSession(body.data);
      await loadSettings();
      setMessage("Signed out. Basic access is active.");
    } catch (logoutError) {
      setPanelError(logoutError instanceof Error ? logoutError.message : "Unable to sign out");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSettings() {
    setIsSaving(true);
    setPanelError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/widgets", {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ enabledWidgetIds })
      });
      const body = (await response.json()) as ApiEnvelope<WidgetSettingsApi> | { status: "error"; message: string };

      if (!response.ok || body.status === "error") {
        throw new Error("message" in body ? body.message : "Unable to save widget settings");
      }

      setSettingsState(body.data);
      setEnabledWidgetIds(body.data.enabledWidgetIds);
      setMessage("Widget visibility updated.");
    } catch (saveError) {
      setPanelError(saveError instanceof Error ? saveError.message : "Unable to save widget settings");
    } finally {
      setIsSaving(false);
    }
  }

  function toggleWidget(widgetId: string) {
    setEnabledWidgetIds((current) =>
      current.includes(widgetId) ? current.filter((item) => item !== widgetId) : [...current, widgetId]
    );
  }

  const canEdit = settingsState?.canEdit === true;
  const cryptoWidgets = groupCatalog(settingsState?.catalog ?? [], "crypto");
  const crossMarketWidgets = groupCatalog(settingsState?.catalog ?? [], "cross_market");

  return (
    <AppShell activeItem="settings">
      <section className="relative flex min-w-0 flex-1 p-4 md:p-6">
        <div className="min-w-0 flex-1">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/48">Workspace Controls</div>
              <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Settings</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
                Manage local access and choose which analytical widgets appear in the dashboard experience.
              </p>
            </div>
            <StatusBadge tone={authSession?.isAdmin ? "green" : "amber"}>
              {authSession?.isAdmin ? "Enterprise" : "Basic"}
            </StatusBadge>
          </motion.div>

          {panelError ? (
            <div className="mb-4 rounded-2xl border border-rose-300/35 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
              {replaceIsoDatesWithLocalTime(panelError)}
            </div>
          ) : null}
          {message ? (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              <Check className="h-4 w-4" />
              {message}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
            <GlassPanel className="p-5">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/16 bg-white/10">
                    <Settings className="h-5 w-5 text-sky-100" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">Access</div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {authSession?.isAdmin ? "Enterprise" : "Basic"}
                    </div>
                  </div>
                </div>
                <StatusBadge tone={authSession?.isAdmin ? "green" : "amber"}>
                  {authSession?.isAdmin ? "Admin" : "Locked"}
                </StatusBadge>
              </div>

              {authSession?.isAdmin ? (
                <div className="space-y-4">
                  <p className="text-sm leading-6 text-white/62">
                    All configured markets and implemented widgets are available. Widget visibility controls what the dashboard renders.
                  </p>
                  <button
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/16 bg-white/10 text-sm font-semibold text-white/84 transition hover:bg-white/16 disabled:opacity-55"
                    disabled={isSaving}
                    onClick={() => void logout()}
                    type="button"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-white/62">
                    Basic access keeps BTC available and limits the dashboard to the two core widgets.
                  </p>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-white/54">Username</span>
                    <input
                      className="h-11 w-full rounded-2xl border border-white/18 bg-white/90 px-4 text-sm font-medium text-slate-950 caret-sky-600 outline-none transition placeholder:text-slate-500 focus:border-sky-200/50 focus:bg-white"
                      onChange={(event) => setUsername(event.target.value)}
                      value={username}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-white/54">Password</span>
                    <input
                      className="h-11 w-full rounded-2xl border border-white/18 bg-white/90 px-4 text-sm font-medium text-slate-950 caret-sky-600 outline-none transition placeholder:text-slate-500 focus:border-sky-200/50 focus:bg-white"
                      onChange={(event) => setPassword(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          void login();
                        }
                      }}
                      type="password"
                      value={password}
                    />
                  </label>
                  <button
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-sky-200/24 bg-sky-200/16 text-sm font-semibold text-sky-50 transition hover:bg-sky-200/22 disabled:opacity-55"
                    disabled={isSaving}
                    onClick={() => void login()}
                    type="button"
                  >
                    <LogIn className="h-4 w-4" />
                    Sign in
                  </button>
                </div>
              )}
            </GlassPanel>

            <GlassPanel className="p-5">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">Widget Visibility</div>
                  <h2 className="mt-1 text-2xl font-semibold text-white">
                    {canEdit ? `${enabledWidgetIds.length} enabled` : "Basic selection"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
                    Enterprise users can choose the analytical engines rendered on the dashboard. Basic access uses a fixed core set.
                  </p>
                </div>
                {canEdit ? (
                  <button
                    className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-emerald-200/24 bg-emerald-300/13 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/18 disabled:opacity-55"
                    disabled={isSaving}
                    onClick={() => void saveSettings()}
                    type="button"
                  >
                    <Save className="h-4 w-4" />
                    Save
                  </button>
                ) : null}
              </div>

              {isLoading ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <div className="h-[92px] animate-pulse rounded-2xl bg-white/8" key={index} />
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {[
                    ["Crypto", cryptoWidgets],
                    ["Cross-Market", crossMarketWidgets]
                  ].map(([label, items]) => (
                    <section key={label as string}>
                      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/42">
                        {label as string}
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {(items as WidgetCatalogItemApi[]).map((item) => {
                          const enabled = enabledWidgetIds.includes(item.widgetId);
                          const disabled = !canEdit || item.isLocked;

                          return (
                            <button
                              className={cn(
                                "group min-h-[96px] rounded-2xl border px-4 py-3 text-left transition",
                                enabled
                                  ? "border-sky-200/30 bg-sky-200/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
                                  : "border-white/10 bg-slate-950/18",
                                disabled && "cursor-not-allowed opacity-58"
                              )}
                              disabled={disabled}
                              key={item.widgetId}
                              onClick={() => toggleWidget(item.widgetId)}
                              type="button"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-white">{item.title}</div>
                                  <div className="mt-1 text-xs capitalize text-white/46">{item.category}</div>
                                </div>
                                <span
                                  className={cn(
                                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                                    enabled
                                      ? "border-sky-200/30 bg-sky-200/16 text-sky-100"
                                      : "border-white/12 bg-white/[0.04] text-white/46"
                                  )}
                                >
                                  {item.isLocked ? <Lock className="h-3.5 w-3.5" /> : enabled ? <Check className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </span>
                              </div>
                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/58">{item.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </GlassPanel>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
