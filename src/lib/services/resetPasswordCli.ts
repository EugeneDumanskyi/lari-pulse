import crypto from "node:crypto";
import { closeDatabase } from "@/lib/db/client";
import { resetPasswordByEmail } from "./accountService";

/**
 * Usage: npm run user:reset-password -- <email>
 *
 * Sets a new random password for the account, re-enables it if it was
 * disabled and signs it out everywhere. Run it on the machine that holds
 * the SQLite database.
 */
function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage: npm run user:reset-password -- <email>");
    process.exitCode = 1;
    return;
  }

  const password = crypto.randomBytes(12).toString("base64url");

  try {
    const user = resetPasswordByEmail(email, password);
    console.log(`Password reset for ${user.email} (${user.role}).`);
    console.log(`Temporary password: ${password}`);
    console.log("Sign in and change it from Settings → Account.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    closeDatabase();
  }
}

main();
