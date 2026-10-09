import { hasPurchasedAccess } from "./paid-access.mjs";

export const FEEDBACK_PASS_COOKIE = "feedback_pass";
export const FEEDBACK_PASS_COOKIE_MAX_AGE = 60 * 60;
export const INACTIVE_PASS_MESSAGE = "This link isn't active any more. Ask the person who sent it for a new one.";

export function normalizePassCode(value) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(code) && !["SIGNIN", "REDEEM"].includes(code) ? code : null;
}

export function isPassActive(pass, now = new Date()) {
  return Boolean(pass && pass.uses < pass.maxUses && (!pass.expiresAt || new Date(pass.expiresAt).getTime() > now.getTime()));
}

/** UTC calendar months, clamped to the final day of the target month. */
export function addPassMonths(now, months) {
  if (!Number.isInteger(months) || months < 1 || months > 120) throw new Error("Invalid feedback pass duration");
  const result = new Date(now);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/**
 * Serializable transactions protect both capacity and a user's concurrent grants.
 * The ledger's (userId, feedbackPassId) unique key is a second idempotency fence.
 * Failed capacity, user or ledger writes roll the entire operation back.
 */
export async function redeemFeedbackPass(db, userId, rawCode, { now = new Date(), maxAttempts = 5 } = {}) {
  const code = normalizePassCode(rawCode);
  if (!code) return { status: "inactive" };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        const pass = await tx.feedbackPass.findUnique({ where: { code } });
        if (!pass) return { status: "inactive" };
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) return { status: "unauthenticated" };
        const existing = await tx.feedbackPassRedemption.findUnique({
          where: { userId_feedbackPassId: { userId, feedbackPassId: pass.id } },
        });
        if (existing) return { status: "redeemed", alreadyRedeemed: true, user };
        if (!isPassActive(pass, now)) return { status: "inactive" };

        const reserved = await tx.feedbackPass.updateMany({
          where: {
            id: pass.id,
            uses: { lt: pass.maxUses },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          data: { uses: { increment: 1 } },
        });
        if (reserved.count !== 1) return { status: "inactive" };

        const grantUntil = addPassMonths(now, pass.months);
        const compUntil = user.compUntil && new Date(user.compUntil) > grantUntil ? new Date(user.compUntil) : grantUntil;
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            compUntil,
            feedbackPassCode: pass.code,
            ...(!hasPurchasedAccess(user) && { accessSource: "feedback" }),
          },
        });
        await tx.feedbackPassRedemption.create({ data: { userId, feedbackPassId: pass.id } });
        return { status: "redeemed", alreadyRedeemed: false, user: updatedUser };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      // P2034: serialization/write conflict; P2002: simultaneous same-user/code insert.
      if (!["P2034", "P2002"].includes(error?.code) || attempt + 1 >= maxAttempts) throw error;
    }
  }
  throw new Error("Feedback pass retry limit exceeded");
}
