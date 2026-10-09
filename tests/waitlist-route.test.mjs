import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { loadTypescript } from "./helpers/load-typescript.mjs";

// Load the real route, Postmark helper and Prisma repository. Only their external
// client boundaries and the public feature flag are replaced with local fixtures.
function fixture({ enabled = true } = {}) {
  const rows = new Map();
  const messages = [];
  const postmarkOptions = [];
  const database = {
    waitlistSignup: {
      async create({ data }) {
        if (rows.has(data.email)) throw Object.assign(new Error("Duplicate email"), { code: "P2002" });
        const row = { ...data, id: String(rows.size + 1), confirmationSentAt: null,
          confirmationClaimToken: null, confirmationClaimedAt: null };
        rows.set(data.email, row);
        return { ...row };
      },
      async findUniqueOrThrow({ where }) {
        const row = rows.get(where.email);
        assert.ok(row, "duplicate lookup should find the original signup");
        return { ...row };
      },
      async updateMany({ where, data }) {
        const row = [...rows.values()].find((entry) => entry.id === where.id);
        if (!row || row.confirmationSentAt !== where.confirmationSentAt) return { count: 0 };
        if (where.confirmationClaimToken && row.confirmationClaimToken !== where.confirmationClaimToken) {
          return { count: 0 };
        }
        if (where.OR && !where.OR.some((condition) => condition.confirmationClaimedAt === null
          ? row.confirmationClaimedAt === null
          : row.confirmationClaimedAt && row.confirmationClaimedAt < condition.confirmationClaimedAt.lt)) {
          return { count: 0 };
        }
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
  class MockPostmarkClient {
    constructor(token, options) {
      assert.equal(token, "mock-postmark-token");
      postmarkOptions.push(options);
    }
    async sendEmail(message) { messages.push(message); }
  }

  const previous = {
    token: process.env.POSTMARK_SERVER_API_TOKEN,
    from: process.env.POSTMARK_FROM_EMAIL,
  };
  process.env.POSTMARK_SERVER_API_TOKEN = "mock-postmark-token";
  process.env.POSTMARK_FROM_EMAIL = "Template <hello@example.test>";
  let route;
  try {
    route = loadTypescript("src/app/api/waitlist/route.ts", {
      "@/shared/config/waitlist": { waitlistConfig: { enabled } },
      "./database.utils": database,
      postmark: { ServerClient: MockPostmarkClient },
    });
  } finally {
    if (previous.token === undefined) delete process.env.POSTMARK_SERVER_API_TOKEN;
    else process.env.POSTMARK_SERVER_API_TOKEN = previous.token;
    if (previous.from === undefined) delete process.env.POSTMARK_FROM_EMAIL;
    else process.env.POSTMARK_FROM_EMAIL = previous.from;
  }
  return { route, rows, messages, postmarkOptions };
}

const request = (email) => new NextRequest("http://localhost/api/waitlist", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Forwarded-For": "127.0.0.1" },
  body: JSON.stringify({ email }),
});

test("actual waitlist route persists a new email and sends through mocked Postmark", async () => {
  const f = fixture();
  assert.equal(f.route.runtime, "nodejs");
  const response = await f.route.POST(request(" READER@Example.test "));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(f.rows.size, 1);
  assert.ok(f.rows.get("reader@example.test").confirmationSentAt instanceof Date);
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].From, "Template <hello@example.test>");
  assert.equal(f.messages[0].To, "reader@example.test");
  assert.match(f.messages[0].Subject, /waitlist/);
  assert.match(f.messages[0].HtmlBody, /waitlist/);
  assert.match(f.messages[0].TextBody, /waitlist/);
  assert.deepEqual(f.postmarkOptions, [{ timeout: 10 }]);
});

test("actual waitlist route handles duplicate email without a second row or mail", async () => {
  const f = fixture();
  assert.equal((await f.route.POST(request("reader@example.test"))).status, 200);
  assert.equal((await f.route.POST(request("READER@example.test"))).status, 200);
  assert.equal(f.rows.size, 1);
  assert.equal(f.messages.length, 1);
});

test("actual waitlist route returns 400 for bad input without provider/database writes", async () => {
  const f = fixture();
  const response = await f.route.POST(request("not an email"));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /valid email/);
  assert.equal(f.rows.size, 0);
  assert.equal(f.messages.length, 0);
});

test("actual waitlist route honors flag-off with 404 and no provider/database writes", async () => {
  const f = fixture({ enabled: false });
  const response = await f.route.POST(request("reader@example.test"));
  assert.equal(response.status, 404);
  assert.equal(f.rows.size, 0);
  assert.equal(f.messages.length, 0);
});
