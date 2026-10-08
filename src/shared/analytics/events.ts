// Central source of truth for analytics event identifiers.
// RouteRev goals use stable event identifiers.
export const ANALYTICS_EVENTS = Object.freeze({
  SIGN_UP: "sign_up",
  ONBOARDING_COMPLETE: "onboarding_complete",
  START_TRIAL: "start_trial",
  FIRST_VALUE: "first_value",
  SUBSCRIBE: "subscribe",
  CANCEL: "cancel",

  // Freemium pricing events
  BOARD_LIMIT_REACHED: "board_limit_reached", // PQL - user hits 5-board limit
  FIRST_BOARD_CREATED: "first_board_created", // Activation event
  UPGRADE_PROMPT_SHOWN: "upgrade_prompt_shown",
  UPGRADE_CLICKED: "upgrade_clicked",
  BOARD_DELETED_TO_STAY_FREE: "board_deleted_to_stay_free",
} as const);

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
