"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Eye,
  KeyRound,
  Link2,
  LogOut,
  Save,
  Server,
  Settings,
  Trash2,
  Users
} from "lucide-react";
import { motion } from "framer-motion";
import type {
  ApiEnvelope,
  CreatedInviteApi,
  InstanceSettingsApi,
  InviteApi,
  UserApi,
  WidgetCatalogItemApi,
  WidgetSettingsApi
} from "@/lib/api/types";
import type { UserRole } from "@/lib/db/types";
import { roleLabel, sessionHasRole, useAuthSession } from "@/components/auth/SessionProvider";
import { AppShell, GlassPanel, StatusBadge } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils/cn";
import { formatLocalDateTime, replaceIsoDatesWithLocalTime } from "@/lib/utils/formatDateTime";

async function requestJson<T>(url: string, init?: RequestInit & { json?: unknown }) {
  const { json, ...rest } = init ?? {};
  const response = await fetch(url, {
    ...rest,
    headers: json === undefined ? rest.headers : { "content-type": "application/json", ...rest.headers },
    body: json === undefined ? rest.body : JSON.stringify(json)
  });
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | { status: "error"; message: string } | null;

  if (!response.ok || !body || body.status === "error") {
    throw new Error(body && "message" in body ? body.message : `Request failed: ${url}`);
  }

  return body.data;
}

const roles: UserRole[] = ["viewer", "analyst", "admin"];

const roleDescriptions: Record<UserRole, string> = {
  viewer: "Reads dashboards, markets and radar.",
  analyst: "Viewer, plus a private portfolio and alerts.",
  admin: "Everything, plus users, invites, instance settings and data collection."
};

const inputClass =
  "h-11 w-full rounded-2xl border border-white/18 bg-white/90 px-4 text-sm font-medium text-slate-950 caret-sky-600 outline-none transition placeholder:text-slate-500 focus:border-sky-200/50 focus:bg-white";
const selectClass =
  "h-10 rounded-xl border border-white/14 bg-slate-950/50 px-3 text-sm font-semibold text-white outline-none focus:border-sky-200/40";
const primaryButton =
  "flex h-11 items-center justify-center gap-2 rounded-2xl border border-sky-200/24 bg-sky-200/16 px-4 text-sm font-semibold text-sky-50 transition hover:bg-sky-200/22 disabled:opacity-55";
const quietButton =
  "flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.06] px-3 text-xs font-semibold text-white/74 transition hover:bg-white/12 disabled:opacity-50";

type Notify = (kind: "ok" | "error", text: string) => void;

function PanelHeader({
  icon: Icon,
  eyebrow,
  title,
  action
}: {
  icon: typeof Settings;
  eyebrow: string;
  title: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/16 bg-white/10">
          <Icon className="h-5 w-5 text-sky-100" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">{eyebrow}</div>
          <div className="mt-1 truncate text-lg font-semibold text-white">{title}</div>
        </div>
      </div>
      {action}
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  label
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full border transition disabled:opacity-50",
        checked ? "border-emerald-200/40 bg-emerald-300/40" : "border-white/16 bg-white/10"
      )}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-6" : "left-0.5")} />
    </button>
  );
}

function AccountPanel({ notify }: { notify: Notify }) {
  const session = useAuthSession();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function changePassword() {
    setIsSaving(true);

    try {
      await requestJson("/api/auth/password", { method: "POST", json: { currentPassword, newPassword } });
      setCurrentPassword("");
      setNewPassword("");
      notify("ok", "Password changed. Other sessions were signed out.");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Unable to change password");
    } finally {
      setIsSaving(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.push("/login");
    router.refresh();
  }

  return (
    <GlassPanel className="p-5">
      <PanelHeader eyebrow="Account" icon={KeyRound} title={session?.email ?? "Signed in"} />
      <div className="mb-5 rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/42">Role</span>
          <StatusBadge tone={session?.role === "admin" ? "green" : "blue"}>{roleLabel(session?.role ?? null)}</StatusBadge>
        </div>
        {session?.role ? <p className="mt-2 text-sm leading-6 text-white/58">{roleDescriptions[session.role]}</p> : null}
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void changePassword();
        }}
      >
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/42">Change password</div>
        <input
          aria-label="Current password"
          autoComplete="current-password"
          className={inputClass}
          onChange={(event) => setCurrentPassword(event.target.value)}
          placeholder="Current password"
          required
          type="password"
          value={currentPassword}
        />
        <input
          aria-label="New password"
          autoComplete="new-password"
          className={inputClass}
          minLength={8}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="New password (8+ characters)"
          required
          type="password"
          value={newPassword}
        />
        <button className={cn(primaryButton, "w-full")} disabled={isSaving} type="submit">
          <Save className="h-4 w-4" />
          Update password
        </button>
      </form>

      <button className={cn(quietButton, "mt-4 h-11 w-full rounded-2xl text-sm")} onClick={() => void signOut()} type="button">
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </GlassPanel>
  );
}

function groupCatalog(catalog: WidgetCatalogItemApi[], group: WidgetCatalogItemApi["group"]) {
  return catalog.filter((item) => item.group === group).sort((left, right) => left.priority - right.priority);
}

function WidgetVisibilityPanel({ notify }: { notify: Notify }) {
  const [state, setState] = useState<WidgetSettingsApi | null>(null);
  const [enabledWidgetIds, setEnabledWidgetIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    requestJson<WidgetSettingsApi>("/api/settings/widgets")
      .then((data) => {
        setState(data);
        setEnabledWidgetIds(data.enabledWidgetIds);
      })
      .catch((error: unknown) => notify("error", error instanceof Error ? error.message : "Unable to load widget settings"));
  }, [notify]);

  async function save() {
    setIsSaving(true);

    try {
      const data = await requestJson<WidgetSettingsApi>("/api/settings/widgets", { method: "PUT", json: { enabledWidgetIds } });
      setState(data);
      setEnabledWidgetIds(data.enabledWidgetIds);
      notify("ok", "Widget visibility updated for everyone on this instance.");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Unable to save widget settings");
    } finally {
      setIsSaving(false);
    }
  }

  const canEdit = state?.canEdit === true;

  return (
    <GlassPanel className="p-5">
      <PanelHeader
        action={
          canEdit ? (
            <button className={primaryButton} disabled={isSaving} onClick={() => void save()} type="button">
              <Save className="h-4 w-4" />
              Save
            </button>
          ) : null
        }
        eyebrow="Widgets"
        icon={Eye}
        title={state ? `${enabledWidgetIds.length} of ${state.catalog.length} enabled` : "Loading…"}
      />
      <p className="-mt-2 mb-5 max-w-2xl text-sm leading-6 text-white/58">
        {canEdit
          ? "Choose the analytical engines every user sees on the dashboard and in Situation Overview."
          : "An admin chooses which analytical engines appear on this instance."}
      </p>

      {!state ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="h-[92px] animate-pulse rounded-2xl bg-white/8" key={index} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {([
            ["Crypto", groupCatalog(state.catalog, "crypto")],
            ["Cross-Market", groupCatalog(state.catalog, "cross_market")]
          ] as const).map(([label, items]) => (
            <section key={label}>
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/42">{label}</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => {
                  const enabled = enabledWidgetIds.includes(item.widgetId);

                  return (
                    <button
                      aria-pressed={enabled}
                      className={cn(
                        "min-h-[96px] rounded-2xl border px-4 py-3 text-left transition",
                        enabled
                          ? "border-sky-200/30 bg-sky-200/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
                          : "border-white/10 bg-slate-950/18",
                        !canEdit && "cursor-default"
                      )}
                      disabled={!canEdit}
                      key={item.widgetId}
                      onClick={() =>
                        setEnabledWidgetIds((current) =>
                          current.includes(item.widgetId)
                            ? current.filter((id) => id !== item.widgetId)
                            : [...current, item.widgetId]
                        )
                      }
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
                            enabled ? "border-sky-200/30 bg-sky-200/16 text-sky-100" : "border-white/12 bg-white/[0.04] text-white/46"
                          )}
                        >
                          {enabled ? <Check className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
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
  );
}

function UsersPanel({ notify }: { notify: Notify }) {
  const session = useAuthSession();
  const [users, setUsers] = useState<UserApi[]>([]);
  const [invites, setInvites] = useState<InviteApi[]>([]);
  const [inviteRole, setInviteRole] = useState<UserRole>("analyst");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState<{ url: string; role: UserRole } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [userData, inviteData] = await Promise.all([
      requestJson<UserApi[]>("/api/admin/users"),
      requestJson<InviteApi[]>("/api/admin/invites")
    ]);
    setUsers(userData);
    setInvites(inviteData);
  }, []);

  useEffect(() => {
    reload().catch((error: unknown) => notify("error", error instanceof Error ? error.message : "Unable to load users"));
  }, [notify, reload]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);

    try {
      await action();
      await reload();
      notify("ok", success);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function createInvite() {
    setBusy(true);

    try {
      const created = await requestJson<CreatedInviteApi>("/api/admin/invites", {
        method: "POST",
        json: { role: inviteRole, email: inviteEmail || undefined }
      });
      setInviteUrl({ url: `${window.location.origin}${created.path}`, role: created.invite.role });
      setInviteEmail("");
      await reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Unable to create invite");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassPanel className="p-5">
      <PanelHeader eyebrow="Users & invites" icon={Users} title={`${users.length} ${users.length === 1 ? "user" : "users"}`} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.14em] text-white/42">
            <tr>
              <th className="pb-2 font-semibold">Email</th>
              <th className="pb-2 font-semibold">Role</th>
              <th className="pb-2 font-semibold">Active</th>
              <th className="pb-2 font-semibold">Joined</th>
              <th className="pb-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {users.map((user) => {
              const isSelf = user.id === session?.userId;

              return (
                <tr key={user.id}>
                  <td className="py-2.5 pr-3 font-semibold text-white/86">
                    {user.email}
                    {isSelf ? <span className="ml-2 text-xs font-normal text-white/44">(you)</span> : null}
                  </td>
                  <td className="py-2.5 pr-3">
                    <select
                      aria-label={`Role for ${user.email}`}
                      className={selectClass}
                      disabled={busy}
                      onChange={(event) =>
                        void run(
                          () => requestJson(`/api/admin/users/${user.id}`, { method: "PATCH", json: { role: event.target.value } }),
                          `${user.email} is now ${event.target.value}.`
                        )
                      }
                      value={user.role}
                    >
                      {roles.map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5 pr-3">
                    <Toggle
                      checked={user.status === "active"}
                      disabled={busy || isSelf}
                      label={`Active status for ${user.email}`}
                      onChange={(active) =>
                        void run(
                          () =>
                            requestJson(`/api/admin/users/${user.id}`, {
                              method: "PATCH",
                              json: { status: active ? "active" : "disabled" }
                            }),
                          `${user.email} ${active ? "enabled" : "disabled"}.`
                        )
                      }
                    />
                  </td>
                  <td className="py-2.5 pr-3 text-white/56">{formatLocalDateTime(user.createdAt)}</td>
                  <td className="py-2.5 text-right">
                    {!isSelf ? (
                      <button
                        aria-label={`Delete ${user.email}`}
                        className={quietButton}
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Delete ${user.email}? Their portfolio and alerts are deleted too.`)) {
                            void run(() => requestJson(`/api/admin/users/${user.id}`, { method: "DELETE" }), `${user.email} deleted.`);
                          }
                        }}
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/42">Invite someone</div>
        <form
          className="flex flex-col gap-3 md:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void createInvite();
          }}
        >
          <input
            aria-label="Invite email (optional)"
            className={cn(inputClass, "md:flex-1")}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="Email (optional, locks the invite to it)"
            type="email"
            value={inviteEmail}
          />
          <select
            aria-label="Invite role"
            className={cn(selectClass, "h-11 rounded-2xl")}
            onChange={(event) => setInviteRole(event.target.value as UserRole)}
            value={inviteRole}
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
          <button className={primaryButton} disabled={busy} type="submit">
            <Link2 className="h-4 w-4" />
            Create invite link
          </button>
        </form>
        <p className="mt-2 text-xs text-white/46">{roleDescriptions[inviteRole]} Links work once and expire after 7 days.</p>

        {inviteUrl ? (
          <div className="mt-4 rounded-2xl border border-emerald-200/24 bg-emerald-300/10 p-4">
            <div className="text-sm font-semibold text-emerald-50">Invite link for a new {inviteUrl.role}</div>
            <p className="mt-1 text-xs text-emerald-50/70">Copy it now. It is shown only once; LariPulse stores only a hash of it.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                aria-label="Invite link"
                className={cn(inputClass, "h-10 font-mono text-xs")}
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                value={inviteUrl.url}
              />
              <button
                className={quietButton}
                onClick={() => {
                  void navigator.clipboard?.writeText(inviteUrl.url);
                  notify("ok", "Invite link copied.");
                }}
                type="button"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
          </div>
        ) : null}

        {invites.length > 0 ? (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/42">Pending invites</div>
            <ul className="space-y-2">
              {invites.map((invite) => (
                <li
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm"
                  key={invite.id}
                >
                  <span className="min-w-0 truncate text-white/78">
                    <span className="font-semibold capitalize text-white">{invite.role}</span>
                    {invite.email ? ` · ${invite.email}` : " · any email"}
                    <span className="text-white/44"> · expires {formatLocalDateTime(invite.expiresAt)}</span>
                  </span>
                  <button
                    className={quietButton}
                    disabled={busy}
                    onClick={() => void run(() => requestJson(`/api/admin/invites/${invite.id}`, { method: "DELETE" }), "Invite revoked.")}
                    type="button"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </GlassPanel>
  );
}

function InstancePanel({ notify }: { notify: Notify }) {
  const [settings, setSettings] = useState<InstanceSettingsApi | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    requestJson<InstanceSettingsApi>("/api/admin/settings")
      .then(setSettings)
      .catch((error: unknown) => notify("error", error instanceof Error ? error.message : "Unable to load instance settings"));
  }, [notify]);

  async function update(patch: Partial<InstanceSettingsApi>, success: string) {
    setBusy(true);

    try {
      setSettings(await requestJson<InstanceSettingsApi>("/api/admin/settings", { method: "PUT", json: patch }));
      notify("ok", success);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Unable to update instance settings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassPanel className="p-5">
      <PanelHeader eyebrow="Instance" icon={Server} title="Who can get in" />
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white">Open sign-up</div>
            <p className="mt-1 text-xs leading-5 text-white/54">
              Anyone who can reach this instance can create a viewer account. When off, people join through invite links.
            </p>
          </div>
          <Toggle
            checked={settings?.signupMode === "open"}
            disabled={!settings || busy}
            label="Open sign-up"
            onChange={(open) =>
              void update({ signupMode: open ? "open" : "closed" }, open ? "Sign-up is open." : "Sign-up is invite-only.")
            }
          />
        </div>
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white">Public read-only dashboard</div>
            <p className="mt-1 text-xs leading-5 text-white/54">
              Visitors who are not signed in can view the dashboard, markets and radar. They cannot change anything.
            </p>
          </div>
          <Toggle
            checked={settings?.publicDashboard === true}
            disabled={!settings || busy}
            label="Public read-only dashboard"
            onChange={(publicDashboard) =>
              void update(
                { publicDashboard },
                publicDashboard ? "The dashboard is public and read-only." : "The dashboard requires sign-in."
              )
            }
          />
        </div>
      </div>
    </GlassPanel>
  );
}

export function SettingsFoundation() {
  const session = useAuthSession();
  const isAdmin = sessionHasRole(session, "admin");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const notify = useCallback<Notify>((kind, text) => setNotice({ kind, text }), []);

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
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/48">Instance Controls</div>
              <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Settings</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
                {isAdmin
                  ? "Manage your account, the people on this instance and what they can see."
                  : "Manage your account and review which analytical widgets are enabled."}
              </p>
            </div>
            <StatusBadge tone={isAdmin ? "green" : "blue"}>{roleLabel(session?.role ?? null)}</StatusBadge>
          </motion.div>

          {notice ? (
            <div
              className={cn(
                "mb-4 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm",
                notice.kind === "ok"
                  ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
                  : "border-rose-300/35 bg-rose-500/12 text-rose-100"
              )}
              role={notice.kind === "error" ? "alert" : "status"}
            >
              {notice.kind === "ok" ? <Check className="h-4 w-4" /> : null}
              {replaceIsoDatesWithLocalTime(notice.text)}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
            <div className="space-y-4">
              <AccountPanel notify={notify} />
              {isAdmin ? <InstancePanel notify={notify} /> : null}
            </div>
            <div className="min-w-0 space-y-4">
              {isAdmin ? <UsersPanel notify={notify} /> : null}
              <WidgetVisibilityPanel notify={notify} />
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
