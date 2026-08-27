"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AuthSessionApi } from "@/lib/api/types";
import type { UserRole } from "@/lib/db/types";

const roleRank: Record<UserRole, number> = {
  viewer: 1,
  analyst: 2,
  admin: 3
};

const SessionContext = createContext<AuthSessionApi | null>(null);

export function SessionProvider({ session, children }: { session: AuthSessionApi; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** The session resolved on the server for the current page, or null outside a guarded page. */
export function useAuthSession() {
  return useContext(SessionContext);
}

export function sessionHasRole(session: AuthSessionApi | null, minimum: UserRole) {
  return Boolean(session?.role && roleRank[session.role] >= roleRank[minimum]);
}

export function roleLabel(role: UserRole | null) {
  if (!role) {
    return "Guest";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}
