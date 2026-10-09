import test from "node:test";
import assert from "node:assert/strict";
import { encode, decode } from "next-auth/jwt";
import { NextRequest } from "next/server.js";
import { loadTypescript } from "./helpers/load-typescript.mjs";

function fixture() {
  const pass = { id: "fixture-pass", code: "FEEDBACK", months: 3, maxUses: 100, uses: 0 };
  let user = { id: "fixture-user", email: "cookies@example.test", subscriptionStatus: "new", hasLifetimeAccess: false };
  const db = {
    feedbackPass: {
      findUnique: async () => pass,
      updateMany: async () => { pass.uses += 1; return { count: 1 }; },
    },
    user: {
      findUnique: async () => user,
      update: async ({ data }) => { user = { ...user, ...data }; return user; },
    },
    feedbackPassRedemption: { findUnique: async () => null, create: async ({ data }) => data },
    $transaction: async (callback) => callback(db),
  };
  return loadTypescript("src/app/pass/redeem/route.ts", {
    "@/shared/utils/database.utils": db,
    "./database.utils": db,
  });
}

for (const secure of [false, true]) {
  test(`actual pass completion rotates ${secure ? "secure" : "standard"} chunked NextAuth cookies`, async () => {
    const previousUrl = process.env.NEXTAUTH_URL;
    const previousSecret = process.env.NEXTAUTH_SECRET;
    const origin = `${secure ? "https" : "http"}://fixture.example.test`;
    const secret = "synthetic-chunked-pass-cookie-secret-0123456789";
    process.env.NEXTAUTH_URL = origin;
    process.env.NEXTAUTH_SECRET = secret;
    try {
      const name = secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
      const oldToken = await encode({ token: { sub: "fixture-user", id: "fixture-user", email: "cookies@example.test", padding: "x".repeat(8000) }, secret });
      const chunks = [];
      for (let offset = 0; offset < oldToken.length; offset += 3936) chunks.push(`${name}.${chunks.length}=${oldToken.slice(offset, offset + 3936)}`);
      assert.ok(chunks.length > 1);
      // Empty legacy tail chunks do not affect authentication and must be expired.
      const request = new NextRequest(`${origin}/pass/redeem`, {
        headers: { cookie: [...chunks, `${name}.9=`, "feedback_pass=FEEDBACK"].join("; ") },
      });
      const response = await fixture().GET(request);
      assert.equal(response.headers.get("location"), `${origin}/dashboard`);
      assert.equal(response.cookies.get(`${name}.9`).maxAge, 0);
      const freshChunks = response.cookies.getAll().filter((cookie) => cookie.name.startsWith(`${name}.`) && cookie.maxAge > 0);
      assert.ok(freshChunks.length > 1);
      for (const cookie of freshChunks) {
        assert.equal(cookie.secure, secure);
        assert.equal(cookie.httpOnly, true);
        assert.equal(cookie.sameSite, "lax");
        assert.equal(cookie.path, "/");
        assert.equal(cookie.maxAge, 30 * 24 * 60 * 60);
      }
      const encoded = freshChunks.sort((a, b) => Number(a.name.split(".").at(-1)) - Number(b.name.split(".").at(-1))).map((cookie) => cookie.value).join("");
      const fresh = await decode({ token: encoded, secret });
      assert.equal(fresh.sub, "fixture-user");
      assert.equal(fresh.accessSource, "feedback");
      assert.equal(fresh.feedbackPassCode, "FEEDBACK");
      assert.ok(new Date(fresh.compUntil) > new Date());
      assert.equal(response.cookies.get("feedback_pass").value, "");
    } finally {
      if (previousUrl === undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL = previousUrl;
      if (previousSecret === undefined) delete process.env.NEXTAUTH_SECRET; else process.env.NEXTAUTH_SECRET = previousSecret;
    }
  });
}
