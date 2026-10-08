/** PostHog is retained only for exception monitoring. */
import posthogLib, { type PostHogConfig } from "posthog-js";
import "posthog-js/dist/exception-autocapture";

let isInitialized = false;

export function initPosthog(): boolean {
  if (typeof window === "undefined") return false;
  if (isInitialized) return true;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return false;

  const config: Partial<PostHogConfig> = {
    api_host: host,
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    capture_exceptions: true,
    capture_heatmaps: false,
    capture_performance: false,
    capture_dead_clicks: false,
    rageclick: false,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_flags: true,
    person_profiles: "never",
    // Keep exception events even if remote settings enable other SDK features.
    before_send: event => event?.event === "$exception" ? event : null,
    persistence: "localStorage+cookie",
    disable_external_dependency_loading: true,
  };

  posthogLib.init(key, config);
  isInitialized = true;
  return true;
}
