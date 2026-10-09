// src/app/api/user/subscription-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/shared/utils/database.utils";
import { withMiddleware } from "@/app/api/_middleware";
import { hasPaidAccess, canAccessApp } from "@/shared/utils/access.server";

/**
 * API endpoint that directly checks the database for the current user's subscription status.
 * This provides an immediate, authoritative view of subscription state, bypassing any
 * NextAuth session caching or JWT issues.
 *
 * Used by the stripe/processing-payment page to ensure we have the most up-to-date status.
 */
export const GET = withMiddleware(async (request: NextRequest) => {
  try {
    // Verify the user is authenticated
    const token = await getToken({ req: request });

    if (!token || !token.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the userId from the token
    const userId = token.id as string;

    // Fetch user directly from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        subscriptionStatus: true,
        hasLifetimeAccess: true,
        compUntil: true,
        accessSource: true,
        subscriptionId: true,
        priceId: true,
        subscriptionEndDate: true,
        subscribedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log(
      `[API] Subscription status check for user ${userId}: ${user.subscriptionStatus}`
    );

    // Return subscription data
    return NextResponse.json({
      status: user.subscriptionStatus,
      hasPaidAccess: hasPaidAccess(user),
      canAccessApp: canAccessApp(user),
      compUntil: user.compUntil,
      accessSource: user.accessSource,
      subscriptionId: user.subscriptionId,
      priceId: user.priceId,
      subscriptionEndDate: user.subscriptionEndDate,
      subscribedAt: user.subscribedAt,
    });
  } catch (error) {
    console.error("[API] Error fetching subscription status:", error);
    return NextResponse.json(
      { error: "Failed to retrieve subscription status" },
      { status: 500 }
    );
  }
});
