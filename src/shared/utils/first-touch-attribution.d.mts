import type { NextRequest, NextResponse } from "next/server";

export type FirstTouchAttribution = {
  ref: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

export type SignupAttribution = {
  signupRef: string | null;
  signupUtmSource: string | null;
  signupUtmMedium: string | null;
  signupUtmCampaign: string | null;
};

export const FIRST_TOUCH_COOKIE_NAME: "app_first_touch";
export const FIRST_TOUCH_MAX_AGE: number;
export const ATTRIBUTION_VALUE_MAX_BYTES: number;
export function readFirstTouch(cookieValue: unknown): FirstTouchAttribution | null;
export function getFirstTouchCapture(
  searchParams: Pick<URLSearchParams, "get">,
  existingCookieValue?: unknown
): string | null;
export function getSignupAttribution(cookieValue?: unknown): SignupAttribution;
export function shouldCaptureFirstTouch(request: NextRequest): boolean;
export function captureFirstTouch<T extends NextResponse>(request: NextRequest, response: T): T;
