import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { encode, getToken } from "next-auth/jwt";
import prisma from "./database.utils";
import { FEEDBACK_PASS_COOKIE, FEEDBACK_PASS_COOKIE_MAX_AGE, INACTIVE_PASS_MESSAGE, redeemFeedbackPass } from "./feedback-pass.mjs";

export function inactivePassResponse() {
  return new NextResponse(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Feedback pass</title></head><body><main><p>${INACTIVE_PASS_MESSAGE}</p></main></body></html>`, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function signInForPass(request: NextRequest, code: string) {
  const response = NextResponse.redirect(new URL("/pass/signin", request.url));
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(FEEDBACK_PASS_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: FEEDBACK_PASS_COOKIE_MAX_AGE,
  });
  return response;
}

export async function redeemPassResponse(request: NextRequest, code: string) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const userId = token?.sub ?? token?.id;
  if (!token || !userId) return signInForPass(request, code);
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required");
  const result = await redeemFeedbackPass(prisma, userId, code);
  if (result.status === "unauthenticated") return signInForPass(request, code);
  if (result.status === "inactive") {
    const response = inactivePassResponse();
    response.cookies.delete(FEEDBACK_PASS_COOKIE);
    return response;
  }

  const user = result.user;
  const maxAge = 30 * 24 * 60 * 60;
  const encoded = await encode({
    token: {
      ...token,
      id: user.id,
      sub: user.id,
      email: user.email,
      subscriptionStatus: user.subscriptionStatus,
      hasLifetimeAccess: user.hasLifetimeAccess,
      compUntil: user.compUntil?.toISOString() ?? null,
      accessSource: user.accessSource,
      feedbackPassCode: user.feedbackPassCode,
    },
    secret,
    maxAge,
  });
  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.headers.set("Cache-Control", "no-store");
  response.cookies.delete(FEEDBACK_PASS_COOKIE);

  // Match NextAuth's default secure-cookie convention and chunk large tokens.
  const secure = process.env.NEXTAUTH_URL?.startsWith("https://") ?? Boolean(process.env.VERCEL);
  const cookieName = secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name === cookieName || cookie.name.startsWith(`${cookieName}.`)) {
      response.cookies.set(cookie.name, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
    }
  }
  const chunkSize = 3936;
  const chunks = Math.ceil(encoded.length / chunkSize);
  for (let i = 0; i < chunks; i += 1) {
    response.cookies.set(chunks === 1 ? cookieName : `${cookieName}.${i}`, encoded.slice(i * chunkSize, (i + 1) * chunkSize), {
      httpOnly: true, secure, sameSite: "lax", path: "/", maxAge,
    });
  }
  return response;
}
