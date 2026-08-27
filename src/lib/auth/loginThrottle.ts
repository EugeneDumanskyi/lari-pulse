/**
 * In-memory limiter for failed sign-in attempts. It is per process, which fits
 * the single-instance deployment LariPulse targets; state resets on restart.
 */

interface AttemptWindow {
  failures: number;
  windowStartedAt: number;
}

export interface LoginThrottleOptions {
  windowMs: number;
  maxFailuresPerAccount: number;
  maxFailuresPerIp: number;
}

export const defaultLoginThrottleOptions: LoginThrottleOptions = {
  windowMs: 15 * 60 * 1000,
  maxFailuresPerAccount: 5,
  maxFailuresPerIp: 25
};

export class LoginThrottle {
  private readonly attempts = new Map<string, AttemptWindow>();

  constructor(private readonly options: LoginThrottleOptions = defaultLoginThrottleOptions) {}

  private keys(ip: string | null, email: string) {
    const client = ip || "unknown";
    return {
      account: `account:${client}:${email.trim().toLowerCase()}`,
      ip: `ip:${client}`
    };
  }

  private current(key: string, now: number) {
    const entry = this.attempts.get(key);

    if (!entry || now - entry.windowStartedAt >= this.options.windowMs) {
      this.attempts.delete(key);
      return null;
    }

    return entry;
  }

  /** Seconds until another attempt is allowed, or 0 when not throttled. */
  retryAfterSeconds(ip: string | null, email: string, now = Date.now()) {
    const keys = this.keys(ip, email);
    const limits: Array<[string, number]> = [
      [keys.account, this.options.maxFailuresPerAccount],
      [keys.ip, this.options.maxFailuresPerIp]
    ];
    let wait = 0;

    for (const [key, limit] of limits) {
      const entry = this.current(key, now);

      if (entry && entry.failures >= limit) {
        wait = Math.max(wait, Math.ceil((entry.windowStartedAt + this.options.windowMs - now) / 1000));
      }
    }

    return wait;
  }

  recordFailure(ip: string | null, email: string, now = Date.now()) {
    const keys = this.keys(ip, email);

    for (const key of [keys.account, keys.ip]) {
      const entry = this.current(key, now);

      if (entry) {
        entry.failures += 1;
      } else {
        this.attempts.set(key, { failures: 1, windowStartedAt: now });
      }
    }
  }

  recordSuccess(ip: string | null, email: string) {
    this.attempts.delete(this.keys(ip, email).account);
  }
}

const globalForThrottle = globalThis as typeof globalThis & { __laripulseLoginThrottle?: LoginThrottle };

export const loginThrottle = globalForThrottle.__laripulseLoginThrottle ?? new LoginThrottle();
globalForThrottle.__laripulseLoginThrottle = loginThrottle;

export function clientIpFromHeaders(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || null;
}
