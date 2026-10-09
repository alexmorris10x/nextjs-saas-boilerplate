import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescript } from "./helpers/load-typescript.mjs";
import { FIRST_TOUCH_COOKIE_NAME, getFirstTouchCapture } from "../src/shared/utils/first-touch-attribution.mjs";

function fixture(db) {
  let cookie = getFirstTouchCapture(new URLSearchParams("ref=feedback&utm_source=newsletter&utm_medium=email&utm_campaign=launch"));
  const auth = loadTypescript("src/shared/auth/authOptions.ts", {
    "@/shared/utils/database.utils": db,
    "next/headers": { cookies: async () => ({ get: (name) => name === FIRST_TOUCH_COOKIE_NAME ? { value: cookie } : undefined }) },
    "@next-auth/prisma-adapter": { PrismaAdapter: () => ({ getUserByEmail: (email) => db.user.findUnique({ where: { email } }) }) },
  }).default;
  return { auth, setCookie: (value) => { cookie = value; }, getCookie: () => cookie };
}

test("actual Google auth adapter saves first touch on its initial insert and leaves later sign-ins unchanged", async () => {
  let record;
  const db = {
    user: {
      async create({ data }) { record = { id: "fixture-user", ...data }; return record; },
      async update({ data }) { Object.assign(record, data); return record; },
      async findUnique() { return record; },
    },
    account: { count: async () => 1 },
  };
  const f = fixture(db);
  const user = await f.auth.adapter.createUser({ email: "fixture@example.test", emailVerified: null, name: "Fixture", image: null });
  assert.equal(user.signupRef, "feedback");
  assert.equal(user.signupUtmSource, "newsletter");
  assert.equal(user.signupUtmMedium, "email");
  assert.equal(user.signupUtmCampaign, "launch");
  await f.auth.events.createUser({ user });
  assert.equal(record.customerId, undefined, "signup has no Stripe customer side effect");
  const laterCookie = getFirstTouchCapture(new URLSearchParams("ref=other&utm_source=ads"), f.getCookie());
  assert.equal(laterCookie, null, "a later visit cannot replace the first cookie");
  // Even a modified cookie on a later sign-in does not touch persisted attribution.
  f.setCookie(getFirstTouchCapture(new URLSearchParams("ref=other&utm_source=ads")));
  await f.auth.adapter.getUserByEmail(user.email);
  await f.auth.callbacks.jwt({ token: { sub: user.id }, user, trigger: "signIn" });
  assert.equal(record.signupRef, "feedback");
  assert.equal(record.signupUtmSource, "newsletter");
});

test("actual adapter writes direct/unknown first-touch fields as null", async () => {
  let inserted;
  const f = fixture({ user: { create: async ({ data }) => { inserted = data; return { id: "direct", ...data }; } } });
  f.setCookie(getFirstTouchCapture(new URLSearchParams()));
  await f.auth.adapter.createUser({ email: "direct@example.test", emailVerified: null, name: null, image: null });
  for (const key of ["signupRef", "signupUtmSource", "signupUtmMedium", "signupUtmCampaign"]) assert.equal(inserted[key], null);
});
