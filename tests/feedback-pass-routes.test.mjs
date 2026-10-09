import test from "node:test";
import assert from "node:assert/strict";
import { encode, decode } from "next-auth/jwt";
import { NextRequest } from "next/server.js";
import { loadTypescript } from "./helpers/load-typescript.mjs";
import { INACTIVE_PASS_MESSAGE } from "../src/shared/utils/feedback-pass.mjs";

process.env.NEXTAUTH_URL = "http://localhost:3000";
process.env.NEXTAUTH_SECRET = "local-pass-route-fixture-secret-0123456789";
const secret = process.env.NEXTAUTH_SECRET;
const origin = "http://localhost:3000";

function fixture() {
  const pass = { id: "pass", code: "FEEDBACK", months: 3, maxUses: 1, uses: 0, expiresAt: null };
  let user = { id: "user", email: "route@example.test", subscriptionStatus: "new", hasLifetimeAccess: false, compUntil: null, accessSource: null };
  let ledger = null;
  const db = {
    feedbackPass: {
      findUnique: async ({ where }) => where.code === pass.code ? pass : null,
      updateMany: async () => { pass.uses += 1; return { count: 1 }; },
    },
    user: {
      findUnique: async () => user,
      update: async ({ data }) => { user = { ...user, ...data }; return user; },
    },
    feedbackPassRedemption: {
      findUnique: async () => ledger,
      create: async ({ data }) => { ledger = data; return data; },
    },
    $transaction: async (callback) => callback(db),
  };
  const mocks = { "@/shared/utils/database.utils": db, "./database.utils": db };
  const entry = loadTypescript("src/app/pass/[code]/route.ts", mocks);
  const completion = loadTypescript("src/app/pass/redeem/route.ts", mocks);
  return { entry, completion, pass, getUser: () => user };
}

test("actual pass route remembers a valid signed-out code for one hour before Google sign-in", async () => {
  const f = fixture();
  const res = await f.entry.GET(new NextRequest(`${origin}/pass/feedback`), { params: Promise.resolve({ code: "feedback" }) });
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), `${origin}/pass/signin`);
  const cookie = res.cookies.get("feedback_pass");
  assert.equal(cookie.value, "FEEDBACK");
  assert.equal(cookie.maxAge, 3600);
  assert.equal(cookie.httpOnly, true);
  assert.equal(f.pass.uses, 0);
});

test("actual unknown/expired/full entry returns the exact plain inactive page", async () => {
  const f = fixture();
  for (const kind of ["unknown", "expired", "full"]) {
    f.pass.expiresAt = kind === "expired" ? new Date(0) : null;
    f.pass.uses = kind === "full" ? f.pass.maxUses : 0;
    const code = kind === "unknown" ? "UNKNOWN" : "FEEDBACK";
    const res = await f.entry.GET(new NextRequest(`${origin}/pass/${code}`), { params: Promise.resolve({ code }) });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.ok((await res.text()).includes(INACTIVE_PASS_MESSAGE));
    assert.equal(res.cookies.get("feedback_pass"), undefined);
  }
});

test("actual post-sign-in completion grants access, replaces JWT and lands on the app home", async () => {
  const f = fixture();
  const old = await encode({ token: { sub: "user", id: "user", email: "route@example.test", subscriptionStatus: "new" }, secret });
  const req = new NextRequest(`${origin}/pass/redeem`, { headers: { cookie: `feedback_pass=FEEDBACK; next-auth.session-token=${old}` } });
  const res = await f.completion.GET(req);
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), `${origin}/dashboard`);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.cookies.get("feedback_pass").value, "");
  const updated = await decode({ token: res.cookies.get("next-auth.session-token").value, secret });
  assert.equal(updated.accessSource, "feedback");
  assert.equal(updated.feedbackPassCode, "FEEDBACK");
  assert.equal(updated.compUntil, f.getUser().compUntil.toISOString());
  assert.equal(f.pass.uses, 1);
  const repeated = await f.completion.GET(req);
  assert.equal(repeated.status, 307);
  assert.equal(f.pass.uses, 1, "a stale request replay consumes no second slot");
});

test("actual completion without pending code remains inactive without a DB write", async () => {
  const f = fixture();
  const res = await f.completion.GET(new NextRequest(`${origin}/pass/redeem`));
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes(INACTIVE_PASS_MESSAGE));
  assert.equal(f.pass.uses, 0);
});
