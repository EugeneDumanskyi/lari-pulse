import type Database from "better-sqlite3";
import type {
  CreatedInviteApi,
  InstanceSettingsApi,
  InviteApi,
  UserApi
} from "@/lib/api/types";
import { isUserRole, requireUser, type AuthSession } from "@/lib/auth/access";
import { hashPassword, normalizeEmail, verifyPassword } from "@/lib/auth/password";
import { appConfig } from "@/lib/config/appConfig";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import {
  countActiveAdmins,
  countUsers,
  createInvite,
  createUser,
  deleteInvite,
  deleteSessionsForUser,
  deleteUser,
  findUsableInvite,
  findUserByEmail,
  findUserById,
  listPendingInvites,
  listUsers,
  markInviteUsed,
  updateUser
} from "@/lib/db/repositories/accountRepository";
import { getAppSettings, updateAppSettings } from "@/lib/db/repositories/appSettingsRepository";
import type { InviteRecord, UserRecord, UserRole, UserStatus } from "@/lib/db/types";
import { ApiInputError } from "./apiValidation";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 256;

function ensureDatabase(db?: Database.Database) {
  if (!db) {
    initializeDatabase();
  }

  return db ?? getDatabase();
}

function toUserApi(user: UserRecord): UserApi {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function toInviteApi(invite: InviteRecord): InviteApi {
  return {
    id: invite.id,
    role: invite.role,
    email: invite.email,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt
  };
}

export function validateCredentials(input: { email?: unknown; password?: unknown }) {
  const email = typeof input.email === "string" ? normalizeEmail(input.email) : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 254) {
    throw new ApiInputError("A valid email address is required");
  }

  validatePassword(password);

  return { email, password };
}

function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiInputError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new ApiInputError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters`);
  }
}

export function getInstanceStatus(db?: Database.Database) {
  const database = ensureDatabase(db);

  return {
    ...getAppSettings(database),
    needsSetup: countUsers(database) === 0
  };
}

/** Creates the first admin. Only works while the instance has no users. */
export function completeFirstRunSetup(input: { email?: unknown; password?: unknown }, db?: Database.Database) {
  const database = ensureDatabase(db);
  const credentials = validateCredentials(input);

  return database.transaction(() => {
    if (countUsers(database) > 0) {
      throw new ApiInputError("Setup is already complete", 409);
    }

    return createUser(database, {
      email: credentials.email,
      passwordHash: hashPassword(credentials.password),
      role: "admin",
      status: "active"
    });
  })();
}

/**
 * Self-service sign-up. Works with a valid invite (which fixes the role) or,
 * when the instance allows open sign-up, as a viewer.
 */
export function signUp(
  input: { email?: unknown; password?: unknown; inviteToken?: unknown },
  db?: Database.Database
) {
  const database = ensureDatabase(db);
  const credentials = validateCredentials(input);
  const inviteToken = typeof input.inviteToken === "string" && input.inviteToken ? input.inviteToken : undefined;

  return database.transaction(() => {
    if (countUsers(database) === 0) {
      throw new ApiInputError("Finish first-run setup before creating accounts", 409);
    }

    const invite = inviteToken ? findUsableInvite(database, inviteToken) : null;

    if (inviteToken && !invite) {
      throw new ApiInputError("This invite link is invalid or has expired", 403);
    }

    if (!invite && getAppSettings(database).signupMode !== "open") {
      throw new ApiInputError("Sign-up is closed. Ask an admin for an invite link.", 403);
    }

    if (invite?.email && invite.email !== credentials.email) {
      throw new ApiInputError("This invite was issued for a different email address", 403);
    }

    if (findUserByEmail(database, credentials.email)) {
      throw new ApiInputError("An account already exists for this email", 409);
    }

    const user = createUser(database, {
      email: credentials.email,
      passwordHash: hashPassword(credentials.password),
      role: invite?.role ?? "viewer",
      status: "active"
    });

    if (invite) {
      markInviteUsed(database, invite.id, user.id);
    }

    return user;
  })();
}

export function describeInvite(token: string | undefined, db?: Database.Database) {
  const invite = findUsableInvite(ensureDatabase(db), token);
  return invite ? toInviteApi(invite) : null;
}

export function changeOwnPassword(
  session: AuthSession,
  input: { currentPassword: unknown; newPassword: unknown; currentToken?: string },
  db?: Database.Database
) {
  const sessionUser = requireUser(session);
  const database = ensureDatabase(db);
  const user = findUserById(database, sessionUser.userId);
  const currentPassword = typeof input.currentPassword === "string" ? input.currentPassword : "";
  const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";

  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    throw new ApiInputError("Current password is incorrect", 400);
  }

  validatePassword(newPassword);
  updateUser(database, user.id, { passwordHash: hashPassword(newPassword) });
  deleteSessionsForUser(database, user.id, input.currentToken);
}

/** Recovery path used by `npm run user:reset-password`. */
export function resetPasswordByEmail(email: string, newPassword: string, db?: Database.Database) {
  const database = ensureDatabase(db);
  const user = findUserByEmail(database, email);

  if (!user) {
    throw new ApiInputError(`No user found for ${normalizeEmail(email)}`, 404);
  }

  validatePassword(newPassword);
  const updated = updateUser(database, user.id, { passwordHash: hashPassword(newPassword), status: "active" });
  deleteSessionsForUser(database, user.id);

  return updated ?? user;
}

export function listUsersForAdmin(session: AuthSession, db?: Database.Database) {
  requireUser(session, "admin");
  return listUsers(ensureDatabase(db)).map(toUserApi);
}

function assertAdminRemains(database: Database.Database, target: UserRecord, next: { role: UserRole; status: UserStatus } | null) {
  const targetIsActiveAdmin = target.role === "admin" && target.status === "active";
  const staysActiveAdmin = next !== null && next.role === "admin" && next.status === "active";

  if (targetIsActiveAdmin && !staysActiveAdmin && countActiveAdmins(database) <= 1) {
    throw new ApiInputError("The instance needs at least one active admin", 409);
  }
}

export function updateUserForAdmin(
  session: AuthSession,
  id: number,
  input: { role?: unknown; status?: unknown },
  db?: Database.Database
) {
  requireUser(session, "admin");
  const database = ensureDatabase(db);
  const target = findUserById(database, id);

  if (!target) {
    throw new ApiInputError("User not found", 404);
  }

  if (input.role !== undefined && !isUserRole(input.role)) {
    throw new ApiInputError("role must be admin, analyst or viewer");
  }

  if (input.status !== undefined && input.status !== "active" && input.status !== "disabled") {
    throw new ApiInputError("status must be active or disabled");
  }

  const next = {
    role: (input.role as UserRole | undefined) ?? target.role,
    status: (input.status as UserStatus | undefined) ?? target.status
  };

  assertAdminRemains(database, target, next);
  const updated = updateUser(database, id, next);

  if (next.status === "disabled") {
    deleteSessionsForUser(database, id);
  }

  return toUserApi(updated ?? target);
}

export function deleteUserForAdmin(session: AuthSession, id: number, db?: Database.Database) {
  const admin = requireUser(session, "admin");
  const database = ensureDatabase(db);
  const target = findUserById(database, id);

  if (!target) {
    throw new ApiInputError("User not found", 404);
  }

  if (target.id === admin.userId) {
    throw new ApiInputError("You cannot delete your own account", 409);
  }

  assertAdminRemains(database, target, null);
  return deleteUser(database, id);
}

export function listInvitesForAdmin(session: AuthSession, db?: Database.Database) {
  requireUser(session, "admin");
  return listPendingInvites(ensureDatabase(db)).map(toInviteApi);
}

export function createInviteForAdmin(
  session: AuthSession,
  input: { role?: unknown; email?: unknown },
  db?: Database.Database
): CreatedInviteApi {
  const admin = requireUser(session, "admin");
  const role = input.role ?? "viewer";

  if (!isUserRole(role)) {
    throw new ApiInputError("role must be admin, analyst or viewer");
  }

  const email = typeof input.email === "string" && input.email.trim() ? normalizeEmail(input.email) : null;

  if (email !== null && !/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new ApiInputError("email must be a valid address when provided");
  }

  const { token, invite } = createInvite(ensureDatabase(db), {
    role,
    email,
    createdBy: admin.userId,
    maxAgeSeconds: appConfig.inviteMaxAgeSeconds
  });

  return {
    invite: toInviteApi(invite),
    token,
    path: `/signup?invite=${encodeURIComponent(token)}`
  };
}

export function revokeInviteForAdmin(session: AuthSession, id: number, db?: Database.Database) {
  requireUser(session, "admin");

  if (!deleteInvite(ensureDatabase(db), id)) {
    throw new ApiInputError("Invite not found", 404);
  }
}

export function getInstanceSettingsForAdmin(session: AuthSession, db?: Database.Database): InstanceSettingsApi {
  requireUser(session, "admin");
  return getAppSettings(ensureDatabase(db));
}

export function updateInstanceSettingsForAdmin(
  session: AuthSession,
  input: { signupMode?: unknown; publicDashboard?: unknown },
  db?: Database.Database
): InstanceSettingsApi {
  requireUser(session, "admin");

  if (input.signupMode !== undefined && input.signupMode !== "open" && input.signupMode !== "closed") {
    throw new ApiInputError("signupMode must be open or closed");
  }

  if (input.publicDashboard !== undefined && typeof input.publicDashboard !== "boolean") {
    throw new ApiInputError("publicDashboard must be a boolean");
  }

  return updateAppSettings(ensureDatabase(db), {
    signupMode: input.signupMode as InstanceSettingsApi["signupMode"] | undefined,
    publicDashboard: input.publicDashboard as boolean | undefined
  });
}
