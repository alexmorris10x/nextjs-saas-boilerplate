import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/shared/utils/database.utils";
import { normalizePassCode, isPassActive } from "@/shared/utils/feedback-pass.mjs";
import { inactivePassResponse, redeemPassResponse, signInForPass } from "@/shared/utils/feedback-pass-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const code = normalizePassCode((await context.params).code);
  if (!code) return inactivePassResponse();
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  // Existing redemptions remain idempotent even once the code fills or expires.
  if (token?.sub || token?.id) return redeemPassResponse(request, code);
  const pass = await prisma.feedbackPass.findUnique({ where: { code } });
  if (!isPassActive(pass)) return inactivePassResponse();
  return signInForPass(request, code);
}
