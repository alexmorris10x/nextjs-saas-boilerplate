import { isInternalAccount } from "./internal-account.mjs";

/** This is an entitlement, not evidence of revenue or a Stripe subscription. */
export function hasPaidAccess(user, now = new Date()) {
  if (!user) return false;
  return isInternalAccount(user.email) || hasPurchasedAccess(user) || hasCompAccess(user, now);
}

export function hasPurchasedAccess(user) {
  return Boolean(user && (user.subscriptionStatus === "active" || user.hasLifetimeAccess));
}

export function hasCompAccess(user, now = new Date()) {
  return Boolean(user?.compUntil && new Date(user.compUntil).getTime() > new Date(now).getTime());
}

/** Clients receive only a server-computed internal flag, never the private email list. */
export function hasSessionPaidAccess(user, now = new Date()) {
  return Boolean(user && (user.isInternal || hasPaidAccess(user, now)));
}

/** Keep trials separate: trialing retains its existing app access without becoming paid. */
export function canAccessApp(user, now = new Date()) {
  return Boolean(user && (hasPaidAccess(user, now) || user.subscriptionStatus === "new" || user.subscriptionStatus === "trialing"));
}

export function canSessionAccessApp(user, now = new Date()) {
  return Boolean(user && (user.isInternal || canAccessApp(user, now)));
}

export function shouldTrackPurchase(user) {
  return Boolean(user && !isInternalAccount(user.email) && !user.isInternal && user.accessSource !== "feedback");
}
