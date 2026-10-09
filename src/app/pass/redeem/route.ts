import { NextRequest } from "next/server";
import { FEEDBACK_PASS_COOKIE, normalizePassCode } from "@/shared/utils/feedback-pass.mjs";
import { inactivePassResponse, redeemPassResponse } from "@/shared/utils/feedback-pass-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = normalizePassCode(request.cookies.get(FEEDBACK_PASS_COOKIE)?.value);
  if (!code) return inactivePassResponse();
  return redeemPassResponse(request, code);
}
