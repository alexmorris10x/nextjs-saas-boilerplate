import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { redeemFeedbackPass } from "../src/shared/utils/feedback-pass.mjs";

const url = process.env.APP_STANDARD_TEST_DATABASE_URL;
const now = new Date("2026-10-09T12:00:00Z");

async function withFixture(callback) {
  const parsed = new URL(url);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname), "DB tests require a loopback PostgreSQL fixture");
  assert.match(parsed.pathname, /(?:test|fixture|ci|acceptance)/i, "DB tests require an explicitly named test database");
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasourceUrl: url });
  const suffix = randomUUID().replaceAll("-", "").toUpperCase();
  const users = [];
  const passes = [];
  let userNumber = 0;
  const makeUser = async (data = {}) => {
    const number = userNumber++;
    const user = await db.user.create({ data: { email: `feedback-fixture-${number}-${suffix}@example.test`, ...data } });
    users.push(user.id);
    return user;
  };
  const makePass = async (data = {}) => {
    const pass = await db.feedbackPass.create({ data: { code: `TEST_${passes.length}_${suffix}`, ...data } });
    passes.push(pass.id);
    return pass;
  };
  try { await callback(db, makeUser, makePass); }
  finally {
    // Only generated fixture IDs are deleted; cascades clean up their redemption rows.
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.feedbackPass.deleteMany({ where: { id: { in: passes } } });
    await db.$disconnect();
  }
}

/** Force two real transactions to share a read snapshot before either writes. */
function racingDatabase(db) {
  let readers = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const conflictCodes = [];
  return {
    conflictCodes,
    $transaction(callback, options) {
      return db.$transaction((tx) => callback({
        user: tx.user,
        feedbackPassRedemption: tx.feedbackPassRedemption,
        feedbackPass: {
          updateMany: (args) => tx.feedbackPass.updateMany(args),
          async findUnique(args) {
            const pass = await tx.feedbackPass.findUnique(args);
            readers += 1;
            if (readers === 2) release();
            if (readers <= 2) await barrier;
            return pass;
          },
        },
      }), options).catch((error) => { conflictCodes.push(error.code); throw error; });
    },
  };
}

const options = { skip: !url };

test("PostgreSQL: two last-slot redemptions never exceed maxUses", options, () => withFixture(async (db, makeUser, makePass) => {
  const [a, b] = await Promise.all([makeUser(), makeUser()]);
  const pass = await makePass({ maxUses: 1 });
  const racing = racingDatabase(db);
  const results = await Promise.all([a, b].map((user) => redeemFeedbackPass(racing, user.id, pass.code, { now })));
  assert.deepEqual(results.map((result) => result.status).sort(), ["inactive", "redeemed"]);
  assert.equal((await db.feedbackPass.findUnique({ where: { id: pass.id } })).uses, 1);
  assert.equal(await db.feedbackPassRedemption.count({ where: { feedbackPassId: pass.id } }), 1);
  assert.ok(racing.conflictCodes.includes("P2034"), "actual serialization failure was retried");
}));

test("PostgreSQL: simultaneous same-user/code redemptions are idempotent", options, () => withFixture(async (db, makeUser, makePass) => {
  const user = await makeUser();
  const pass = await makePass();
  const racing = racingDatabase(db);
  const results = await Promise.all([1, 2].map(() => redeemFeedbackPass(racing, user.id, pass.code, { now })));
  assert.deepEqual(results.map((result) => result.alreadyRedeemed).sort(), [false, true]);
  assert.equal((await db.feedbackPass.findUnique({ where: { id: pass.id } })).uses, 1);
  assert.equal(await db.feedbackPassRedemption.count({ where: { feedbackPassId: pass.id } }), 1);
}));

test("PostgreSQL: concurrent different codes retain a user's longest grant and code history", options, () => withFixture(async (db, makeUser, makePass) => {
  const user = await makeUser();
  const long = await makePass({ months: 6 });
  const short = await makePass({ months: 1 });
  const racing = racingDatabase(db);
  await Promise.all([long, short].map((pass) => redeemFeedbackPass(racing, user.id, pass.code, { now })));
  assert.equal((await db.user.findUnique({ where: { id: user.id } })).compUntil.toISOString(), "2027-04-09T12:00:00.000Z");
  assert.equal(await db.feedbackPassRedemption.count({ where: { userId: user.id } }), 2);
  assert.equal((await redeemFeedbackPass(db, user.id, long.code, { now })).alreadyRedeemed, true);
  assert.equal((await db.feedbackPass.findUnique({ where: { id: long.id } })).uses, 1);
}));

test("PostgreSQL: paying users keep accessSource and their later compUntil", options, () => withFixture(async (db, makeUser, makePass) => {
  const user = await makeUser({ subscriptionStatus: "active", accessSource: "stripe", compUntil: new Date("2028-01-01") });
  const pass = await makePass();
  const result = await redeemFeedbackPass(db, user.id, pass.code, { now });
  assert.equal(result.user.accessSource, "stripe");
  assert.equal(result.user.compUntil.toISOString(), "2028-01-01T00:00:00.000Z");
  assert.equal(result.user.customerId, null);
}));

test("PostgreSQL: ledger failure rolls back both capacity and user grant", options, () => withFixture(async (db, makeUser, makePass) => {
  const user = await makeUser();
  const pass = await makePass();
  const failing = {
    $transaction(callback, settings) {
      return db.$transaction((tx) => callback({
        user: tx.user,
        feedbackPass: tx.feedbackPass,
        feedbackPassRedemption: {
          findUnique: (args) => tx.feedbackPassRedemption.findUnique(args),
          create: async () => { throw new Error("synthetic ledger failure"); },
        },
      }), settings);
    },
  };
  await assert.rejects(redeemFeedbackPass(failing, user.id, pass.code, { now }), /synthetic ledger failure/);
  assert.equal((await db.feedbackPass.findUnique({ where: { id: pass.id } })).uses, 0);
  assert.equal((await db.user.findUnique({ where: { id: user.id } })).compUntil, null);
  assert.equal(await db.feedbackPassRedemption.count({ where: { userId: user.id } }), 0);
}));
