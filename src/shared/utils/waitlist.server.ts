import "server-only";
import prisma from "./database.utils";
import type { WaitlistRepository } from "./waitlist.mjs";

export const waitlistRepository: WaitlistRepository = {
  async ensureSignup(data) {
    try {
      return await prisma.waitlistSignup.create({ data });
    } catch (error) {
      // The unique email constraint also handles two first signups racing.
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") {
        throw error;
      }
      return prisma.waitlistSignup.findUniqueOrThrow({ where: { email: data.email } });
    }
  },
  async claimConfirmation(id, token, now, staleBefore) {
    const claimed = await prisma.waitlistSignup.updateMany({
      where: {
        id,
        confirmationSentAt: null,
        OR: [
          { confirmationClaimedAt: null },
          { confirmationClaimedAt: { lt: staleBefore } },
        ],
      },
      data: { confirmationClaimToken: token, confirmationClaimedAt: now },
    });
    return claimed.count === 1;
  },
  async markConfirmationSent(id, token, now) {
    const marked = await prisma.waitlistSignup.updateMany({
      where: { id, confirmationClaimToken: token, confirmationSentAt: null },
      data: {
        confirmationSentAt: now,
        confirmationClaimToken: null,
        confirmationClaimedAt: null,
      },
    });
    if (marked.count !== 1) throw new Error("Waitlist confirmation claim no longer held");
  },
  async releaseConfirmation(id, token) {
    await prisma.waitlistSignup.updateMany({
      where: { id, confirmationClaimToken: token, confirmationSentAt: null },
      data: { confirmationClaimToken: null, confirmationClaimedAt: null },
    });
  },
};
