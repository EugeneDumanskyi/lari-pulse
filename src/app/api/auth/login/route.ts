import { NextRequest, NextResponse } from "next/server";
import { authenticateAccount } from "@/lib/auth/access";
import { clientIpFromHeaders, loginThrottle } from "@/lib/auth/loginThrottle";
import { apiErrorJson } from "@/lib/services/apiResponses";
import { ApiInputError } from "@/lib/services/apiValidation";
import { signedInResponse } from "@/lib/services/authResponses";

export const runtime = "nodejs";

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as LoginBody;
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const ip = clientIpFromHeaders(request.headers);
    const retryAfter = loginThrottle.retryAfterSeconds(ip, email);

    if (retryAfter > 0) {
      return NextResponse.json(
        { status: "error", message: "Too many sign-in attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const user = authenticateAccount({ email, password });

    if (!user) {
      loginThrottle.recordFailure(ip, email);
      throw new ApiInputError("Invalid email or password", 401);
    }

    loginThrottle.recordSuccess(ip, email);

    return signedInResponse(request, user.id);
  } catch (error) {
    return apiErrorJson(error, "Unable to sign in");
  }
}
