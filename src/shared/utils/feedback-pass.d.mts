import type { PrismaClient, User } from "@prisma/client";
export const FEEDBACK_PASS_COOKIE: string;
export const FEEDBACK_PASS_COOKIE_MAX_AGE: number;
export const INACTIVE_PASS_MESSAGE: string;
export function normalizePassCode(value: unknown): string | null;
export function isPassActive(pass: { uses: number; maxUses: number; expiresAt?: Date | string | null } | null | undefined, now?: Date): boolean;
export function addPassMonths(now: Date, months: number): Date;
export function redeemFeedbackPass(db: PrismaClient, userId: string, rawCode: unknown, options?: { now?: Date; maxAttempts?: number }): Promise<
  { status: "inactive" } | { status: "unauthenticated" } |
  { status: "redeemed"; alreadyRedeemed: boolean; user: User }
>;
