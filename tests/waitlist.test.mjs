import test from "node:test";
import assert from "node:assert/strict";
import { createWaitlistHandler, createWaitlistRateLimiter } from "../src/shared/utils/waitlist.mjs";
import { createPostmarkSender } from "../src/shared/utils/postmark-sender.mjs";

function mockRepository() {
  const rows = new Map();
  return {
    rows,
    async ensureSignup(data) {
      if (!rows.has(data.email)) {
        rows.set(data.email, { ...data, id: String(rows.size + 1), confirmationSentAt: null,
          confirmationClaimToken: null, confirmationClaimedAt: null });
      }
      return { ...rows.get(data.email) };
    },
    async claimConfirmation(id, token, now, staleBefore) {
      const row = [...rows.values()].find((entry) => entry.id === id);
      if (row.confirmationSentAt || (row.confirmationClaimedAt && row.confirmationClaimedAt >= staleBefore)) {
        return false;
      }
      row.confirmationClaimToken = token;
      row.confirmationClaimedAt = now;
      return true;
    },
    async markConfirmationSent(id, token, now) {
      const row = [...rows.values()].find((entry) => entry.id === id);
      assert.equal(row.confirmationClaimToken, token);
      row.confirmationSentAt = now;
      row.confirmationClaimToken = null;
      row.confirmationClaimedAt = null;
    },
    async releaseConfirmation(id, token) {
      const row = [...rows.values()].find((entry) => entry.id === id);
      if (row.confirmationClaimToken === token) {
        row.confirmationClaimToken = null;
        row.confirmationClaimedAt = null;
      }
    },
  };
}

const request = (email = "reader@example.com", ip = "127.0.0.1") => new Request("http://localhost/api/waitlist", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
  body: JSON.stringify({ email }),
});

function setup(options = {}) {
  const repository = mockRepository();
  const messages = [];
  const sendEmail = createPostmarkSender({
    client: { async sendEmail(message) { messages.push(message); } },
    from: "Your App <hello@example.com>",
  });
  const handler = createWaitlistHandler({ enabled: () => true, repository, sendEmail,
    appName: "Example & App", ...options });
  return { repository, messages, handler };
}

test("new signup stores normalized email and sends confirmation via mocked Postmark", async () => {
  const { handler, repository, messages } = setup();
  const response = await handler(request("  READER@Example.com  "));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(repository.rows.size, 1);
  assert.ok(repository.rows.get("reader@example.com").confirmationSentAt instanceof Date);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].From, "Your App <hello@example.com>");
  assert.equal(messages[0].To, "reader@example.com");
  assert.match(messages[0].Subject, /waitlist/);
  assert.match(messages[0].HtmlBody, /Example &amp; App/);
  assert.match(messages[0].TextBody, /Example & App/);
});

test("duplicate signup is idempotent for both row and successful confirmation", async () => {
  const { handler, repository, messages } = setup();
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request("READER@example.com"))).status, 200);
  assert.equal(repository.rows.size, 1);
  assert.equal(messages.length, 1);
});

test("bad input and malformed JSON return 400 without storing or mailing", async () => {
  for (const email of ["bad", "a@", ".bad@example.com", "a..b@example.com", "a@-bad.com", "a\nb@example.com", 123, null, "x".repeat(65) + "@example.com"]) {
    const { handler, repository, messages } = setup();
    assert.equal((await handler(request(email))).status, 400, String(email));
    assert.equal(repository.rows.size, 0);
    assert.equal(messages.length, 0);
  }
  const { handler } = setup();
  const malformed = new Request("http://localhost/api/waitlist", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  });
  assert.equal((await handler(malformed)).status, 400);
});

test("oversized and non-JSON payloads are rejected", async () => {
  const { handler, repository, messages } = setup();
  const oversized = new Request("http://localhost/api/waitlist", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "reader@example.com", junk: "x".repeat(4096) }),
  });
  assert.equal((await handler(oversized)).status, 400);
  const form = new Request("http://localhost/api/waitlist", { method: "POST", body: "email=reader@example.com" });
  assert.equal((await handler(form)).status, 400);
  assert.equal(repository.rows.size, 0);
  assert.equal(messages.length, 0);
});

test("disabled waitlist rejects API without touching database or mail", async () => {
  const { handler, repository, messages } = setup({ enabled: () => false });
  assert.equal((await handler(request())).status, 404);
  assert.equal(repository.rows.size, 0);
  assert.equal(messages.length, 0);
});

test("local rate limit works with no Upstash dependency and includes Retry-After", async () => {
  let time = 100;
  const { handler } = setup({ limit: createWaitlistRateLimiter({ now: () => time }) });
  for (let count = 0; count < 5; count++) assert.equal((await handler(request())).status, 200);
  const rejected = await handler(request());
  assert.equal(rejected.status, 429);
  assert.equal(rejected.headers.get("Retry-After"), "600");
  time += 600_000;
  assert.equal((await handler(request())).status, 200);
});

test("global limit bounds rotating IP headers", () => {
  const limit = createWaitlistRateLimiter({ total: 2 });
  assert.equal(limit("ip-1").allowed, true);
  assert.equal(limit("ip-2").allowed, true);
  assert.equal(limit("ip-3").allowed, false);
});

test("bounded client state rejects overflow without evicting active buckets", () => {
  let time = 100;
  const limit = createWaitlistRateLimiter({ maxClients: 2, perClient: 1, now: () => time });
  assert.equal(limit("ip-1").allowed, true);
  assert.equal(limit("ip-2").allowed, true);
  assert.equal(limit("ip-3").allowed, false);
  assert.equal(limit("ip-1").allowed, false);
  time += 600_000;
  assert.equal(limit("ip-3").allowed, true);
});

test("concurrent duplicates across handler instances send only one confirmation", async () => {
  const repository = mockRepository();
  let sends = 0;
  let finishMail;
  const pendingMail = new Promise((resolve) => { finishMail = resolve; });
  const options = { enabled: () => true, repository, sendEmail: async () => {
    sends += 1;
    await pendingMail;
  } };
  const firstHandler = createWaitlistHandler(options);
  const secondHandler = createWaitlistHandler(options);
  const first = firstHandler(request());
  await new Promise((resolve) => setImmediate(resolve));
  const second = await secondHandler(request());
  assert.equal(second.status, 503);
  assert.equal(sends, 1);
  finishMail();
  assert.equal((await first).status, 200);
  assert.equal(repository.rows.size, 1);
  assert.equal((await secondHandler(request())).status, 200);
  assert.equal(sends, 1);
});

test("failed confirmation keeps signup and permits duplicate retry", async () => {
  const repository = mockRepository();
  let attempts = 0;
  const sendEmail = createPostmarkSender({ from: "hello@example.com", client: {
    async sendEmail() {
      attempts += 1;
      if (attempts === 1) throw new Error("Mock Postmark unavailable");
    },
  } });
  const handler = createWaitlistHandler({ enabled: () => true, repository, sendEmail });
  assert.equal((await handler(request())).status, 503);
  assert.equal(repository.rows.size, 1);
  assert.equal(repository.rows.get("reader@example.com").confirmationSentAt, null);
  assert.equal(repository.rows.get("reader@example.com").confirmationClaimToken, null);
  assert.equal((await handler(request())).status, 200);
  assert.equal(repository.rows.size, 1);
  assert.equal(attempts, 2);
});

test("missing Postmark config is a retryable failure, never a sent confirmation", async () => {
  const { handler, repository } = setup({ sendEmail: createPostmarkSender({ client: null }) });
  assert.equal((await handler(request())).status, 503);
  assert.equal(repository.rows.get("reader@example.com").confirmationSentAt, null);
});

test("abandoned confirmation lease can be reclaimed without adding another row", async () => {
  const repository = mockRepository();
  const now = new Date("2026-10-09T13:00:00Z");
  const signup = await repository.ensureSignup({ email: "reader@example.com", source: "landing", product: null });
  await repository.claimConfirmation(signup.id, "abandoned", new Date(now.getTime() - 300_001), new Date(0));
  let sends = 0;
  const handler = createWaitlistHandler({ enabled: () => true, repository, now: () => now,
    sendEmail: async () => { sends += 1; } });
  assert.equal((await handler(request())).status, 200);
  assert.equal(sends, 1);
  assert.equal(repository.rows.size, 1);
});

test("failed marker write leaves delivered attempt leased to prevent immediate repeats", async () => {
  const repository = mockRepository();
  repository.markConfirmationSent = async () => { throw new Error("Mock database unavailable"); };
  let sends = 0;
  const handler = createWaitlistHandler({ enabled: () => true, repository,
    sendEmail: async () => { sends += 1; } });
  assert.equal((await handler(request())).status, 503);
  assert.equal((await handler(request())).status, 503);
  assert.equal(sends, 1);
  assert.ok(repository.rows.get("reader@example.com").confirmationClaimToken);
});
