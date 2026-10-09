import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server.js";
import {
  FIRST_TOUCH_COOKIE_NAME,
  captureFirstTouch,
  getSignupAttribution,
} from "../src/shared/utils/first-touch-attribution.mjs";

function browserCookie(response) {
  return response.headers.getSetCookie()
    .find((cookie) => cookie.startsWith(`${FIRST_TOUCH_COOKIE_NAME}=`))
    .split(";")[0];
}

test("Next's actual cookie serialization round-trips attribution through a sign-in redirect", () => {
  const request = new NextRequest("https://example.com/pass/FEEDBACK?ref=a%20b&utm_source=email&utm_medium=letter&utm_campaign=launch");
  const response = NextResponse.redirect(new URL("/api/auth/signin", request.url));
  response.cookies.set("feedback_pass", "FEEDBACK");
  assert.equal(captureFirstTouch(request, response), response);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://example.com/api/auth/signin");
  assert.equal(response.cookies.get("feedback_pass").value, "FEEDBACK");
  const callback = new NextRequest("https://example.com/api/auth/callback/google", {
    headers: { cookie: browserCookie(response) },
  });
  assert.deepEqual(getSignupAttribution(callback.cookies.get(FIRST_TOUCH_COOKIE_NAME).value), {
    signupRef: "a b",
    signupUtmSource: "email",
    signupUtmMedium: "letter",
    signupUtmCampaign: "launch",
  });
});

test("Next's actual blank marker survives a later campaign without renewing the cookie", () => {
  const first = captureFirstTouch(new NextRequest("https://example.com/"), NextResponse.next());
  const later = new NextRequest("https://example.com/pricing?ref=late", {
    headers: { cookie: browserCookie(first) },
  });
  const response = captureFirstTouch(later, NextResponse.next());
  assert.equal(response.cookies.get(FIRST_TOUCH_COOKIE_NAME), undefined);
  assert.equal(getSignupAttribution(later.cookies.get(FIRST_TOUCH_COOKIE_NAME).value).signupRef, null);
});
