import { NextRequest } from "next/server";
import { signUp } from "@/lib/services/accountService";
import { apiErrorJson } from "@/lib/services/apiResponses";
import { signedInResponse } from "@/lib/services/authResponses";

export const runtime = "nodejs";

interface SignupBody {
  email?: unknown;
  password?: unknown;
  inviteToken?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as SignupBody;
    const user = signUp(body);

    return signedInResponse(request, user.id, { status: 201 });
  } catch (error) {
    return apiErrorJson(error, "Unable to create account");
  }
}
