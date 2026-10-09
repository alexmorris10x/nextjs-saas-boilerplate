export type AccessUser = {
  email?: string | null;
  subscriptionStatus?: string | null;
  hasLifetimeAccess?: boolean;
  compUntil?: Date | string | null;
  accessSource?: string | null;
  isInternal?: boolean;
};
export function hasPaidAccess(user: AccessUser | null | undefined, now?: Date): boolean;
export function hasPurchasedAccess(user: AccessUser | null | undefined): boolean;
export function hasCompAccess(user: AccessUser | null | undefined, now?: Date): boolean;
export function hasSessionPaidAccess(user: AccessUser | null | undefined, now?: Date): boolean;
export function canAccessApp(user: AccessUser | null | undefined, now?: Date): boolean;
export function canSessionAccessApp(user: AccessUser | null | undefined, now?: Date): boolean;
export function shouldTrackPurchase(user: AccessUser | null | undefined): boolean;
