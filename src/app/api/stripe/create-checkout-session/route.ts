import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/shared/utils/stripe.utils";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import authOptions from "@/shared/auth/authOptions";
import prisma from "@/shared/utils/database.utils";
import { withMiddleware } from "@/app/api/_middleware";
import { hasPaidAccess, isInternalAccount } from "@/shared/utils/access.server";

/**
 * POST /api/stripe/create-checkout-session
 * Returns: { url: string } – Stripe‑hosted Checkout URL
 */
export const POST = withMiddleware(async (request: NextRequest) => {
  console.log(
    "🍪 cookies:",
    request.headers.get("cookie")?.slice(0, 80) ?? "<none>"
  );

  let payload: Record<string, unknown> | null = null;
  if (request.headers.get("content-type")?.includes("application/json")) {
    payload = await request.json().catch(() => null);
  }

  const session = await getServerSession(authOptions);
  console.log("🔑 next-auth session:", JSON.stringify(session, null, 2));

  // ----- NEW: pull userId from session, then load user record -----
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      customerId: true,
      subscriptionStatus: true,
      hasLifetimeAccess: true,
      compUntil: true,
      accessSource: true,
    },
  });
  if (!user?.email) {
    return NextResponse.json(
      { error: "User not found / missing email" },
      { status: 400 }
    );
  }

  // Complimentary/internal entitlements do not create billing objects.
  if (isInternalAccount(user.email) || (hasPaidAccess(user) && user.accessSource === "feedback") || user.hasLifetimeAccess) {
    return NextResponse.json({ url: new URL("/dashboard", request.url).toString() });
  }

  // ───────────── Disposable‑email guard ─────────────
  const disposableDomains = [
    "mailinator.com",
    "tempmail.com",
    "10minutemail.com",
  ];
  const emailParts = user.email.split("@");
  const userDomain = (emailParts[1] ?? "").toLowerCase();
  if (disposableDomains.includes(userDomain)) {
    return NextResponse.json(
      {
        error:
          "Disposable e‑mail addresses are not allowed for the free trial.",
      },
      { status: 400 }
    );
  }
  // ──────────────────────────────────────────────────

  const stripe = getStripe();

  const defaultPriceId = process.env.STRIPE_PRICE_ID_BASIC;
  if (!defaultPriceId) {
    return NextResponse.json(
      { error: "Stripe price not configured" },
      { status: 500 }
    );
  }

  const allowedPriceIds = [
    defaultPriceId,
    process.env.STRIPE_PRICE_ID_YEARLY,
  ].filter(Boolean) as string[];

  const requestedPriceId =
    typeof payload?.priceId === "string" ? payload?.priceId : undefined;

  const priceIdToUse = requestedPriceId ?? defaultPriceId;

  if (!allowedPriceIds.includes(priceIdToUse)) {
    return NextResponse.json(
      { error: "Invalid price selection" },
      { status: 400 }
    );
  }

  // Reuse or create Stripe Customer
  let customerId = user.customerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email!,
      metadata: { internalUserId: user.id },
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { customerId },
    });
  }

  // Check if this is a renewal (user had a cancelled subscription)
  const isRenewal = user.subscriptionStatus === "canceled";

  // Build checkout session with conditional trial period
  const checkoutParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdToUse, quantity: 1 }],
    // Do not require a card up front for trials
    payment_method_collection: "if_required",
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    // Point to the new post-checkout handler to rotate the cookie before redirecting to the frontend
    success_url: `${process.env.BASE_URL}/api/stripe/post-checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: process.env.CANCEL_URL!,
    // Add client_reference_id to link checkout session back to the User ID
    client_reference_id: user.id,
    metadata: { userId: user.id },
    subscription_data: {
      metadata: { userId: user.id },
    },
  };

  // Only add trial period for new subscriptions, not renewals
  // Trials are handled in-app, so checkout charges immediately after completion.

  // Create checkout session with appropriate settings
  const sessionStripe = await stripe.checkout.sessions.create(checkoutParams, {
    idempotencyKey: isRenewal
      ? `renewal_${user.id}_${Date.now()}` // Unique key for renewals
      : `checkout_${user.id}_${priceIdToUse}_${Date.now()}`, // Distinguish per attempt + plan for new signups
  });

  return NextResponse.json({ url: sessionStripe.url });
});
