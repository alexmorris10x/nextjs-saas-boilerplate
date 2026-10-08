"use client";

import { ANALYTICS_EVENTS } from "./events";
import type { AnalyticsEventName } from "./events";

type IdentifyPayload = {
  id: string;
  email?: string | null;
  plan?: string | null;
  createdAt?: string | null;
};

type EventProperties = Record<string, unknown>;

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
export function identifyUser(payload: IdentifyPayload) {
  if (typeof window === "undefined" || !payload.id) return;
  window.rr?.("identify", payload.id);
}

export function captureEvent(event: AnalyticsEventName | string, properties?: EventProperties) {
  if (typeof window === "undefined" || !event) return;
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
