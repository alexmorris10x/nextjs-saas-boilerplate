import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { loadTypescript } from "./helpers/load-typescript.mjs";

const origin = "http://middleware.example.test";
process.env.BASE_URL = origin;
process.env.NEXTAUTH_URL = origin;
const { middleware } = loadTypescript("src/middleware.ts", {
  "next-auth/jwt": { getToken: async () => null },
});

test("actual middleware lets anonymous waitlist POST reach its rate-limited public handler", async () => {
  const request = new NextRequest(`${origin}/api/waitlist`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "fixture@example.test" }),
  });
  const response = await middleware(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("location"), null);
});

test("actual middleware still gates anonymous private APIs and waitlist-like paths", async () => {
  for (const path of ["/api/user/complete-onboarding", "/api/waitlist/private", "/api/waitlist-evil"]) {
    const response = await middleware(new NextRequest(`${origin}${path}`, { method: "POST" }));
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get("location"), `${origin}/`, path);
    assert.equal(response.headers.get("x-middleware-next"), null, path);
  }
});
