"use client";

import { ANALYTICS_EVENTS } from "./events";
import { shouldTrackPurchase } from "@/shared/utils/paid-access.mjs";
import type { AnalyticsEventName } from "./events";

type IdentifyPayload = {
  id: string;
  email?: string | null;
  plan?: string | null;
  createdAt?: string | null;
  isInternal?: boolean;
  accessSource?: string | null;
};

type EventProperties = Record<string, unknown>;
let currentUser: IdentifyPayload | null = null;

declare global {
  interface Window {
    rr?: (command: "goal" | "identify", value: string, properties?: EventProperties) => void;
  }
}

function sanitize<T extends EventProperties>(properties?: T) {
  if (!properties) return undefined;
  return Object.fromEntries(
    Object.entries(properties).filter(
      ([, value]) => value !== undefined && value !== null
    )
  );
}

// RouteRev's install snippet queues calls before its collector script loads.
// With no snippet configured, analytics are disabled rather than sent elsewhere.
export function identifyUser(payload: IdentifyPayload | null) {
  if (typeof window === "undefined") return;
  if (!payload?.id) { currentUser = null; return; }
  currentUser = payload;
  window.rr?.("identify", payload.id);
}

export function captureEvent(event: AnalyticsEventName | string, properties?: EventProperties) {
  if (typeof window === "undefined" || !event) return;
  // Purchase goals must have a known external, non-feedback account context.
  if ([ANALYTICS_EVENTS.SUBSCRIBE, "purchase", "stripe_subscription_success"].includes(event) && !shouldTrackPurchase(currentUser)) return;
  window.rr?.("goal", event, sanitize(properties));
}

export function captureSignUp(plan?: string | null, ref?: string | null) {
  captureEvent(ANALYTICS_EVENTS.SIGN_UP, sanitize({ plan, ref }));
}

export function captureOnboardingComplete(variant?: string | null) {
  captureEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETE, sanitize({ variant }));
}

export function captureFirstValue(
  surface: string,
  timeToValueMs?: number | null
) {
  if (!surface) return;
  captureEvent(
    ANALYTICS_EVENTS.FIRST_VALUE,
    sanitize({
      surface,
      time_to_value_ms: timeToValueMs ?? undefined,
    })
  );
}
