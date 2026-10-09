import test from "node:test";
import assert from "node:assert/strict";
import { addPassMonths, normalizePassCode, redeemFeedbackPass } from "../src/shared/utils/feedback-pass.mjs";
import { createFeedbackPass, parsePassOptions } from "../scripts/create-pass.mjs";

const now = new Date("2026-10-09T12:00:00Z");

// Serializable transactional fake: writes are published only after callback success.
// DB acceptance separately exercises PostgreSQL's actual conflict/unique behaviour.
function database({ passes = [{ id: "p1", code: "FEEDBACK", months: 3, maxUses: 100, uses: 0, expiresAt: null }], users = [{ id: "u1", subscriptionStatus: "new", compUntil: null, accessSource: null }] } = {}) {
  let state = { passes: structuredClone(passes), users: structuredClone(users), redemptions: [] };
  let lane = Promise.resolve();
  let fail = null;
  return {
    get state() { return state; },
    failNext(error) { fail = error; },
    $transaction(callback, options) {
      assert.equal(options.isolationLevel, "Serializable");
      const run = lane.then(async () => {
        if (fail) { const error = fail; fail = null; throw error; }
        const draft = structuredClone(state);
        const tx = {
          feedbackPass: {
            findUnique: async ({ where }) => draft.passes.find((pass) => pass.code === where.code) ?? null,
            updateMany: async ({ where }) => {
              const pass = draft.passes.find((pass) => pass.id === where.id);
              if (!pass || pass.uses >= where.uses.lt || (pass.expiresAt && new Date(pass.expiresAt) <= where.OR[1].expiresAt.gt)) return { count: 0 };
              pass.uses += 1;
              return { count: 1 };
            },
          },
          user: {
            findUnique: async ({ where }) => draft.users.find((user) => user.id === where.id) ?? null,
            update: async ({ where, data }) => {
              const user = draft.users.find((user) => user.id === where.id);
              Object.assign(user, data);
              return user;
            },
          },
          feedbackPassRedemption: {
            findUnique: async ({ where }) => draft.redemptions.find((item) => item.userId === where.userId_feedbackPassId.userId && item.feedbackPassId === where.userId_feedbackPassId.feedbackPassId) ?? null,
            create: async ({ data }) => {
              if (draft.redemptions.some((row) => row.userId === data.userId && row.feedbackPassId === data.feedbackPassId)) throw Object.assign(new Error("duplicate"), { code: "P2002" });
              draft.redemptions.push(data);
              return data;
            },
          },
        };
        const result = await callback(tx);
        state = draft;
        return result;
      });
      lane = run.catch(() => {});
      return run;
    },
  };
}

test("valid case-insensitive pass grants calendar months and a single slot", async () => {
  const db = database();
  const result = await redeemFeedbackPass(db, "u1", " feedback ", { now });
  assert.equal(result.status, "redeemed");
  assert.equal(result.user.compUntil.toISOString(), "2027-01-09T12:00:00.000Z");
  assert.equal(result.user.accessSource, "feedback");
  assert.equal(result.user.feedbackPassCode, "FEEDBACK");
  assert.equal(db.state.passes[0].uses, 1);
  assert.equal(db.state.redemptions.length, 1);
});

test("unknown, malformed, expired and full codes have no writes", async () => {
  for (const code of ["UNKNOWN", "../bad", ""]) {
    const db = database();
    assert.equal((await redeemFeedbackPass(db, "u1", code, { now })).status, "inactive");
    assert.equal(db.state.passes[0].uses, 0);
  }
  for (const overrides of [{ expiresAt: now }, { uses: 1, maxUses: 1 }]) {
    const db = database({ passes: [{ id: "p1", code: "FEEDBACK", months: 3, maxUses: 100, uses: 0, ...overrides }] });
    const before = structuredClone(db.state);
    assert.equal((await redeemFeedbackPass(db, "u1", "FEEDBACK", { now })).status, "inactive");
    assert.deepEqual(db.state, before);
  }
});

test("concurrent redemptions cannot overuse the last slot", async () => {
  const db = database({ passes: [{ id: "p1", code: "FEEDBACK", months: 3, maxUses: 1, uses: 0 }], users: [{ id: "u1" }, { id: "u2" }] });
  const results = await Promise.all(["u1", "u2"].map((id) => redeemFeedbackPass(db, id, "FEEDBACK", { now })));
  assert.deepEqual(results.map((result) => result.status).sort(), ["inactive", "redeemed"]);
  assert.equal(db.state.passes[0].uses, 1);
});

test("same user is idempotent sequentially and concurrently, including after expiry/full", async () => {
  const db = database({ passes: [{ id: "p1", code: "FEEDBACK", months: 3, maxUses: 1, uses: 0 }] });
  const results = await Promise.all([1, 2].map(() => redeemFeedbackPass(db, "u1", "FEEDBACK", { now })));
  assert.deepEqual(results.map((result) => result.alreadyRedeemed).sort(), [false, true]);
  const later = await redeemFeedbackPass(db, "u1", "FEEDBACK", { now: new Date("2027-12-01") });
  assert.equal(later.alreadyRedeemed, true);
  assert.equal(later.user.compUntil.toISOString(), "2027-01-09T12:00:00.000Z");
  assert.equal(db.state.passes[0].uses, 1);
});

test("already-paying users keep accessSource and later compUntil survives", async () => {
  for (const paid of [{ subscriptionStatus: "active" }, { hasLifetimeAccess: true }]) {
    const db = database({ users: [{ id: "u1", accessSource: "stripe", compUntil: new Date("2028-01-01"), ...paid }] });
    const result = await redeemFeedbackPass(db, "u1", "FEEDBACK", { now });
    assert.equal(result.user.accessSource, "stripe");
    assert.equal(result.user.compUntil.toISOString(), "2028-01-01T00:00:00.000Z");
  }
});

test("multiple simultaneous codes preserve the longest per-user grant and ledger history", async () => {
  const db = database({ passes: [{ id: "long", code: "LONG", months: 6, uses: 0, maxUses: 10 }, { id: "short", code: "SHORT", months: 1, uses: 0, maxUses: 10 }] });
  await Promise.all(["LONG", "SHORT"].map((code) => redeemFeedbackPass(db, "u1", code, { now })));
  assert.equal(db.state.users[0].compUntil.toISOString(), "2027-04-09T12:00:00.000Z");
  assert.equal(db.state.redemptions.length, 2);
  assert.equal((await redeemFeedbackPass(db, "u1", "LONG", { now })).alreadyRedeemed, true);
  assert.equal(db.state.passes[0].uses, 1);
});

test("serialization and unique conflicts retry; unexpected failures propagate", async () => {
  for (const code of ["P2034", "P2002"]) {
    const db = database();
    db.failNext(Object.assign(new Error(code), { code }));
    assert.equal((await redeemFeedbackPass(db, "u1", "FEEDBACK", { now })).status, "redeemed");
    assert.equal(db.state.passes[0].uses, 1);
  }
  const db = database();
  db.failNext(new Error("offline"));
  await assert.rejects(redeemFeedbackPass(db, "u1", "FEEDBACK", { now }), /offline/);
  assert.equal(db.state.passes[0].uses, 0);
});

test("calendar-month grants clamp month ends and invalid durations roll back", async () => {
  assert.equal(addPassMonths(new Date("2026-01-31T12:30:00Z"), 1).toISOString(), "2026-02-28T12:30:00.000Z");
  assert.equal(normalizePassCode(" abc-123_ "), "ABC-123_");
  const db = database({ passes: [{ id: "p1", code: "FEEDBACK", months: 0, maxUses: 1, uses: 0 }] });
  await assert.rejects(redeemFeedbackPass(db, "u1", "FEEDBACK", { now }), /duration/);
  assert.equal(db.state.passes[0].uses, 0);
});

test("create-pass dry run prints a working normalized link with no DB or providers", async () => {
  const lines = [];
  const result = await createFeedbackPass(["--code", "feedback", "--months", "3", "--max-uses", "100", "--expires", "2027-01-01", "--note", "testing", "--dry-run"], { env: { NEXT_PUBLIC_APP_URL: "https://app.example.com" }, output: (line) => lines.push(line) });
  assert.deepEqual(lines, ["https://app.example.com/pass/FEEDBACK"]);
  assert.equal(result.data.months, 3);
  assert.equal(result.data.maxUses, 100);
  assert.equal(result.data.note, "testing");
});

test("create-pass validates options and creates exactly one pass when injected a test DB", async () => {
  const rows = [];
  await createFeedbackPass(["--code", "NEW"], { db: { feedbackPass: { create: async ({ data }) => rows.push(data) } }, output: () => {} });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, "NEW");
  for (const args of [["--code", "a/b"], ["--code", "REDEEM"], ["--code", "GOOD", "--months", "0"], ["--code", "GOOD", "--max-uses", "1.5"], ["--code", "GOOD", "--expires", "bad"], ["--code", "GOOD", "--extra", "x"]]) assert.throws(() => parsePassOptions(args));
});
