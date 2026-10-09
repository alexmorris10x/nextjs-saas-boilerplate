/** First-touch data is attribution only. Never use this cookie for access control. */
export const FIRST_TOUCH_COOKIE_NAME = "app_first_touch";
export const FIRST_TOUCH_MAX_AGE = 30 * 24 * 60 * 60;
export const ATTRIBUTION_VALUE_MAX_BYTES = 128;
const COOKIE_MAX_LENGTH = 4096;
const keys = ["ref", "utm_source", "utm_medium", "utm_campaign"];
const encoder = new TextEncoder();

/** Keep text small enough for one cookie, without splitting Unicode characters. */
function boundedValue(value) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim();
  let result = "";
  let bytes = 0;
  for (const character of clean) {
    const size = encoder.encode(character).length;
    if (bytes + size > ATTRIBUTION_VALUE_MAX_BYTES) break;
    result += character;
    bytes += size;
  }
  return result || null;
}

/** @returns {{ref: string|null, utm_source: string|null, utm_medium: string|null, utm_campaign: string|null}|null} */
export function readFirstTouch(cookieValue) {
  if (typeof cookieValue !== "string" || cookieValue.length > COOKIE_MAX_LENGTH) {
    return null;
  }
  try {
    const data = JSON.parse(decodeURIComponent(cookieValue));
    if (!data || typeof data !== "object" || Array.isArray(data) || data.v !== 1) {
      return null;
    }
    const result = {};
    for (const key of keys) {
      // A valid blank first visit is an explicit null marker, not an absent cookie.
      if (data[key] !== null && typeof data[key] !== "string") return null;
      result[key] = boundedValue(data[key]);
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Return a new cookie only if there is no valid first-touch marker already.
 * Record a marker even with no campaign parameters so a later visit cannot win.
 */
export function getFirstTouchCapture(searchParams, existingCookieValue) {
  if (readFirstTouch(existingCookieValue)) return null;
  const data = { v: 1 };
  for (const key of keys) data[key] = boundedValue(searchParams.get(key));
  return encodeURIComponent(JSON.stringify(data));
}

/** Map only recognized cookie fields to the new account's nullable Prisma fields. */
export function getSignupAttribution(cookieValue) {
  const firstTouch = readFirstTouch(cookieValue);
  return {
    signupRef: firstTouch?.ref ?? null,
    signupUtmSource: firstTouch?.utm_source ?? null,
    signupUtmMedium: firstTouch?.utm_medium ?? null,
    signupUtmCampaign: firstTouch?.utm_campaign ?? null,
  };
}

/** Skip background fetches, prefetches and assets; a document redirect is a visit. */
export function shouldCaptureFirstTouch(request) {
  const path = request.nextUrl.pathname;
  if (request.method !== "GET") return false;
  if (/^\/(?:api|_next)(?:\/|$)/.test(path) || /\.[^/]+$/.test(path)) return false;
  if (request.headers.has("next-router-prefetch")) return false;
  if (/prefetch/i.test(request.headers.get("purpose") || "")) return false;
  if (/prefetch/i.test(request.headers.get("sec-purpose") || "")) return false;
  const destination = request.headers.get("sec-fetch-dest");
  if (destination && destination !== "document") return false;
  return true;
}

/** Set the cookie on the actual response, preserving redirects and other cookies. */
export function captureFirstTouch(request, response) {
  if (!shouldCaptureFirstTouch(request)) return response;
  const value = getFirstTouchCapture(
    request.nextUrl.searchParams,
    request.cookies.get(FIRST_TOUCH_COOKIE_NAME)?.value
  );
  if (value !== null) {
    response.cookies.set(FIRST_TOUCH_COOKIE_NAME, value, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: FIRST_TOUCH_MAX_AGE,
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return response;
}
