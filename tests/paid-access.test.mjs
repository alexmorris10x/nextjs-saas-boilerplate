import test from "node:test";
import assert from "node:assert/strict";
import { internalAccountEmails, isInternalAccount } from "../src/shared/utils/internal-account.mjs";
import { hasPaidAccess, hasSessionPaidAccess, canAccessApp, shouldTrackPurchase } from "../src/shared/utils/paid-access.mjs";

const now = new Date("2026-10-09T12:00:00Z");

test("internal accounts match case, whitespace and exact addresses", () => {
  assert.deepEqual(internalAccountEmails(" Alex@Example.com, , alex@example.com, QA@EXAMPLE.COM "), ["alex@example.com", "qa@example.com"]);
  assert.equal(isInternalAccount("  ALEX@EXAMPLE.COM  ", "alex@example.com"), true);
  assert.equal(isInternalAccount("alex@example.com.evil", "alex@example.com"), false);
  assert.equal(isInternalAccount("other@example.com", "alex@example.com"), false);
  for (const value of [undefined, null, "", "  "]) assert.equal(isInternalAccount(value, ""), false);
  assert.equal(isInternalAccount("alex@example.com", ""), false);
});

test("each independent paid entitlement and expired compUntil", () => {
  const old = process.env.INTERNAL_ACCOUNT_EMAILS;
  process.env.INTERNAL_ACCOUNT_EMAILS = "owner@example.com";
  try {
    assert.equal(hasPaidAccess({ email: "OWNER@example.com", subscriptionStatus: "canceled" }, now), true);
    assert.equal(hasPaidAccess({ subscriptionStatus: "active" }, now), true);
    assert.equal(hasPaidAccess({ hasLifetimeAccess: true, subscriptionStatus: "expired" }, now), true);
    assert.equal(hasPaidAccess({ compUntil: "2026-10-10T12:00:00Z" }, now), true);
    for (const compUntil of [null, "2026-10-09T12:00:00Z", "2026-10-08T12:00:00Z", "not a date"]) {
      assert.equal(hasPaidAccess({ compUntil }, now), false);
    }
    assert.equal(hasPaidAccess(null, now), false);
    assert.equal(hasPaidAccess({ subscriptionStatus: "trialing" }, now), false);
    assert.equal(hasPaidAccess({ isInternal: true }, now), false, "server helper never trusts a cached/client internal flag");
    assert.equal(hasSessionPaidAccess({ isInternal: true }, now), true);
  } finally {
    if (old === undefined) delete process.env.INTERNAL_ACCOUNT_EMAILS; else process.env.INTERNAL_ACCOUNT_EMAILS = old;
  }
});

test("free tier and trial app semantics are retained separately", () => {
  assert.equal(canAccessApp({ subscriptionStatus: "new" }, now), true);
  assert.equal(canAccessApp({ subscriptionStatus: "trialing" }, now), true);
  assert.equal(canAccessApp({ subscriptionStatus: "canceled" }, now), false);
  assert.equal(canAccessApp({ subscriptionStatus: "canceled", compUntil: "2026-10-10" }, now), true);
});

test("internal and feedback accounts never qualify for purchase goals", () => {
  assert.equal(shouldTrackPurchase(null), false);
  assert.equal(shouldTrackPurchase({ isInternal: true }), false);
  assert.equal(shouldTrackPurchase({ accessSource: "feedback", subscriptionStatus: "active" }), false);
  assert.equal(shouldTrackPurchase({ email: "external@example.com", accessSource: "stripe" }), true);
});
