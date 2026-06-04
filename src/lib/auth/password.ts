import crypto from "node:crypto";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(SALT_LENGTH).toString("hex");
  const key = crypto.scryptSync(password, salt, KEY_LENGTH).toString("hex");

  return `scrypt:${salt}:${key}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, expected] = storedHash.split(":");

  if (scheme !== "scrypt" || !salt || !expected) {
    return false;
  }

  const actual = crypto.scryptSync(password, salt, KEY_LENGTH);
  const expectedBuffer = Buffer.from(expected, "hex");

  if (actual.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actual, expectedBuffer);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
