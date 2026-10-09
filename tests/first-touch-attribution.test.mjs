import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTRIBUTION_VALUE_MAX_BYTES,
  FIRST_TOUCH_COOKIE_NAME,
  FIRST_TOUCH_MAX_AGE,
  captureFirstTouch,
  getFirstTouchCapture,
  getSignupAttribution,
  readFirstTouch,
  shouldCaptureFirstTouch,
} from "../src/shared/utils/first-touch-attribution.mjs";

const emptySignup = {
  signupRef: null,
  signupUtmSource: null,
  signupUtmMedium: null,
  signupUtmCampaign: null,
};

function makeRequest(url, { cookie, method = "GET", headers = {} } = {}) {
  return {
    method,
    nextUrl: new URL(url),
    headers: new Headers(headers),
    cookies: { get: (name) => name === FIRST_TOUCH_COOKIE_NAME && cookie ? { value: cookie } : undefined },
  };
}

function makeResponse(status = 200) {
  const setCookies = [];
  return { status, setCookies, cookies: { set: (...args) => setCookies.push(args) } };
}

test("first ref/UTM visit flows through the cookie into new-user fields", () => {
  const response = makeResponse();
  captureFirstTouch(makeRequest("https://example.com/?ref=alex&utm_source=letter&utm_medium=email&utm_campaign=launch"), response);
  assert.equal(response.setCookies.length, 1);
  const [name, cookie] = response.setCookies[0];
  assert.equal(name, FIRST_TOUCH_COOKIE_NAME);
  // This is the same mapping spread into createUser's persistence data.
  const savedUser = { id: "new-user", ...getSignupAttribution(cookie) };
  assert.deepEqual(savedUser, {
    id: "new-user",
    signupRef: "alex",
    signupUtmSource: "letter",
    signupUtmMedium: "email",
    signupUtmCampaign: "launch",
  });
  const subsequent = makeResponse();
  captureFirstTouch(makeRequest("https://example.com/pricing?ref=other&utm_source=ads", { cookie }), subsequent);
  assert.equal(subsequent.setCookies.length, 0, "later visits neither overwrite nor renew the first-touch cookie");
  assert.deepEqual(getSignupAttribution(cookie), {
    signupRef: "alex",
    signupUtmSource: "letter",
    signupUtmMedium: "email",
    signupUtmCampaign: "launch",
  });
});

test("an untagged first visitor is locked before a later campaign visit", () => {
  const cookie = getFirstTouchCapture(new URLSearchParams());
  assert.equal(typeof cookie, "string");
  assert.deepEqual(getSignupAttribution(cookie), emptySignup);
  assert.equal(getFirstTouchCapture(new URLSearchParams("ref=later&utm_campaign=second"), cookie), null);
  assert.deepEqual(getSignupAttribution(cookie), emptySignup);
});

test("first visit captures all parameters on a redirect without replacing the response", () => {
  const request = makeRequest("https://example.com/dashboard?utm_source=feedback");
  const response = makeResponse(307);
  response.location = "/api/auth/signin";
  assert.equal(captureFirstTouch(request, response), response);
  assert.equal(response.status, 307);
  assert.equal(response.location, "/api/auth/signin");
  assert.deepEqual(response.setCookies[0][2], {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
    secure: true,
  });
  assert.equal(FIRST_TOUCH_MAX_AGE, 2592000);
});

test("the development HTTP cookie is usable without Secure", () => {
  const response = makeResponse();
  captureFirstTouch(makeRequest("http://localhost:3000/?ref=dev"), response);
  assert.equal(response.setCookies[0][2].secure, false);
});

test("values are trimmed, control-free and bounded without splitting Unicode", () => {
  const cookie = getFirstTouchCapture(new URLSearchParams({
    ref: "  hello\r\n\0world  ",
    utm_source: "🧡".repeat(500),
    utm_medium: "a".repeat(500),
    utm_campaign: " \t ",
  }));
  const result = readFirstTouch(cookie);
  assert.equal(result.ref, "helloworld");
  assert.equal(result.utm_source, "🧡".repeat(32));
  assert.equal(result.utm_medium.length, ATTRIBUTION_VALUE_MAX_BYTES);
  assert.equal(result.utm_campaign, null);
  const largest = getFirstTouchCapture(new URLSearchParams(Object.fromEntries(
    ["ref", "utm_source", "utm_medium", "utm_campaign"].map((key) => [key, "🧡".repeat(500)])
  )));
  assert.ok(largest.length < 4096, "even worst-case Unicode fits a single cookie");
});

test("a tampered cookie cannot inject fields or unbounded database values", () => {
  const cookie = encodeURIComponent(JSON.stringify({
    v: 1,
    ref: "r".repeat(5000),
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    hasLifetimeAccess: true,
  }));
  assert.deepEqual(getSignupAttribution(cookie), emptySignup, "oversized cookies are ignored");
  const bounded = encodeURIComponent(JSON.stringify({ v: 1, ref: "r".repeat(500), utm_source: null, utm_medium: null, utm_campaign: null, isAdmin: true }));
  assert.equal(getSignupAttribution(bounded).signupRef.length, 128);
  assert.ok(!("isAdmin" in getSignupAttribution(bounded)));
});

test("malformed or unknown-version cookies are ignored and can be repaired", () => {
  for (const value of [undefined, "", "%broken", "null", "[]", "{}", "true", encodeURIComponent(JSON.stringify({ v: 2 })), encodeURIComponent(JSON.stringify({ v: 1, ref: {} }))]) {
    assert.equal(readFirstTouch(value), null);
    assert.deepEqual(getSignupAttribution(value), emptySignup);
    assert.equal(typeof getFirstTouchCapture(new URLSearchParams("ref=valid"), value), "string");
  }
});

test("assets, API calls, non-GET requests and prefetches do not lock attribution", () => {
  for (const request of [
    makeRequest("https://example.com/api/waitlist"),
    makeRequest("https://example.com/_next/data/page"),
    makeRequest("https://example.com/og-image.png"),
    makeRequest("https://example.com/sitemap.xml"),
    makeRequest("https://example.com/llms.txt"),
    makeRequest("https://example.com/", { method: "POST" }),
    makeRequest("https://example.com/", { headers: { "next-router-prefetch": "1" } }),
    makeRequest("https://example.com/", { headers: { purpose: "prefetch" } }),
    makeRequest("https://example.com/", { headers: { "sec-purpose": "prefetch;prerender" } }),
    makeRequest("https://example.com/", { headers: { "sec-fetch-dest": "empty" } }),
  ]) {
    const response = makeResponse();
    assert.equal(shouldCaptureFirstTouch(request), false);
    assert.equal(captureFirstTouch(request, response), response);
    assert.equal(response.setCookies.length, 0);
  }
  assert.equal(shouldCaptureFirstTouch(makeRequest("https://example.com/pass/FEEDBACK", { headers: { "sec-fetch-dest": "document" } })), true);
});
