import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/shared/utils/stripe.utils";
import prisma from "@/shared/utils/database.utils";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";

type CheckoutSessionWithExpanded = Stripe.Checkout.Session & {
  payment_method?: string | Stripe.PaymentMethod | null;
  trial_end?: number | null;
  line_items?: {
    data: Array<{
      price?: Stripe.Price | null;
    }>;
  };
};

// Note: In Next.js App Router, body parsing is handled automatically.
// The raw body is accessed via request.arrayBuffer() in the POST handler below.

export const POST = async (request: NextRequest) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripe();
  let event;

  // ✅ Correct way to access headers with NextRequest
  const signature = request.headers.get("stripe-signature");

  if (!signature || !webhookSecret) {
    console.error("Missing stripe-signature header or webhook secret");
    return NextResponse.json(
      { error: "Missing stripe-signature header or webhook secret" },
      { status: 400 }
    );
  }

  // ✅ Correctly fetch the raw body (crucial!)
  const bodyBuffer = await request.arrayBuffer();
  const body = Buffer.from(bodyBuffer);

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    console.log(`Received Stripe event: ${event.type}`);
  } catch (err) {
    console.error(
      `Webhook signature verification failed. ${(err as Error).message}`
    );
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  const data = event.data.object;
  console.log(`Event data:`, data);

  // Idempotency: skip already‑handled events
  const seen = await prisma.subscriptionEvent.findUnique({
    where: { stripeEventId: event.id },
  });
  if (seen) {
    console.log("Duplicate webhook event skipped:", event.id);
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(data as Stripe.Subscription);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(data as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(data as Stripe.Subscription);
        break;
      case "customer.subscription.paused":
        await handleSubscriptionPaused(data as Stripe.Subscription);
        break;
      case "customer.subscription.resumed":
        await handleSubscriptionResumed(data as Stripe.Subscription);
        break;
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(data as Stripe.Checkout.Session);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(data as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(data as Stripe.Invoice);
        break;
      case "invoice.finalized":
        await handleInvoiceFinalized(data as Stripe.Invoice);
        break;
      case "customer.subscription.trial_will_end":
        console.log("Trial ending soon for sub:", (data as Stripe.Subscription).id);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // record successful processing (idempotency & audit)
    const subId =
      (data as any).id ?? // customer.subscription.*
      (data as any).subscription ?? // invoice.*, checkout.session.*, etc.
      null;

    const eventCreate: Prisma.SubscriptionEventCreateInput = {
      stripeEventId: event.id,
      type: event.type,
      payload: JSON.parse(body.toString()),
      stripeSubscriptionId: subId,
    };

    await prisma.subscriptionEvent.create({ data: eventCreate });

    console.log("Webhook processed successfully");
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error in webhook handler:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
};

import { SubscriptionStatus } from "@prisma/client";

// Helper to map Stripe status to our Prisma enum
function mapStripeStatusToPrisma(status: Stripe.Subscription.Status): SubscriptionStatus {
  // Map Stripe statuses to our Prisma enum values
  const statusMap: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
    active: "active",
    canceled: "canceled",
    incomplete: "incomplete",
    incomplete_expired: "incomplete_expired",
    past_due: "past_due",
    paused: "expired", // We map 'paused' to 'expired' since our enum doesn't have 'paused'
    trialing: "trialing",
    unpaid: "unpaid",
  };
  return statusMap[status] ?? "new";
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log("Processing subscription created:", subscription.id);
  const firstItem = subscription.items?.data?.[0];
  const updateData = {
    subscriptionStatus: mapStripeStatusToPrisma(subscription.status),
    subscriptionId: subscription.id,
    priceId: firstItem?.price?.id ?? null,
  };

  try {
    const user = await prisma.user.update({
      where: { customerId: subscription.customer as string },
      data: updateData,
    });

    console.log(`Subscription created for user: ${user.email}`);
  } catch (error) {
    console.error("Error updating user:", error);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log("Processing subscription updated:", subscription.id);
  try {
    const firstItem = subscription.items?.data?.[0];
    const user = await prisma.user.update({
      where: { customerId: subscription.customer as string },
      data: {
        subscriptionStatus: mapStripeStatusToPrisma(subscription.status),
        priceId: firstItem?.price?.id ?? null,
      },
    });

    console.log(`Subscription updated for user: ${user.email}`);
    console.log(`New subscription status: ${user.subscriptionStatus}`);
  } catch (error) {
    console.error("Error updating subscription:", error);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log("Processing subscription deleted:", subscription.id);
  try {
    const user = await prisma.user.update({
      where: { customerId: subscription.customer as string },
      data: {
        subscriptionStatus: "canceled",
        subscriptionId: null,
        priceId: null,
      },
    });

    console.log(`Subscription canceled for user: ${user.email}`);
  } catch (error) {
    console.error(
      "Error updating user after subscription cancellation:",
      error
    );
  }
}

async function handleSubscriptionPaused(subscription: Stripe.Subscription) {
  console.log("Processing subscription paused:", subscription.id);
  try {
    await prisma.user.update({
      where: { customerId: subscription.customer as string },
      data: {
        // Map paused to 'expired' to gate access; update if enum gains 'paused'
        subscriptionStatus: "expired",
      },
    });
    console.log(`Subscription paused for customer: ${subscription.customer}`);
  } catch (error) {
    console.error("Error handling subscription pause:", error);
  }
}

async function handleSubscriptionResumed(subscription: Stripe.Subscription) {
  console.log("Processing subscription resumed:", subscription.id);
  try {
    await prisma.user.update({
      where: { customerId: subscription.customer as string },
      data: {
        subscriptionStatus: mapStripeStatusToPrisma(subscription.status),
      },
    });
    console.log(`Subscription resumed for customer: ${subscription.customer}`);
  } catch (error) {
    console.error("Error handling subscription resume:", error);
  }
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
) {
  const stripe = getStripe();
  console.log("checkout.session.completed:", session.id);
  console.log("🔍 session.subscription:", session.subscription);
  console.log("🔍 session.customer:", session.customer);
  console.log(
    "🔍 full session snapshot:",
    JSON.stringify(session, null, 2).slice(0, 400) + "..."
  );

  const extendedSession = session as CheckoutSessionWithExpanded;
  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;
  const priceId = extendedSession.line_items?.data[0]?.price?.id;

  // ───────────── Duplicate‑card trial guard ─────────────
  let cardFingerprint: string | undefined;
  if (extendedSession.payment_method) {
    try {
      const paymentMethodId =
        typeof extendedSession.payment_method === "string"
          ? extendedSession.payment_method
          : extendedSession.payment_method?.id;
      if (paymentMethodId) {
        const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
        cardFingerprint = (pm.card as any)?.fingerprint;
        if (cardFingerprint) {
          const existing = await prisma.user.findFirst({
            where: {
              paymentFingerprint: cardFingerprint,
              subscriptionStatus: "active",
            },
            select: { id: true },
          });
          if (existing) {
            // duplicate subscription attempt – cancel the new subscription and exit
            if (subId) {
              await stripe.subscriptions.cancel(subId);
            }
            console.log(
              "❌ Duplicate subscription with same payment method blocked. Subscription canceled."
            );
            return;
          }
        }
      }
    } catch (err) {
      console.error("Error retrieving payment method:", err);
    }
  }
  // ─────────────────────────────────────────────────────

  console.log("🔔 Upserting Subscription for", {
    subId,
    customerId,
    priceId,
    hasEmail: !!session.customer_details?.email,
  });

  // Mirror status into legacy User columns for middleware until fully migrated
  if (!customerId) {
    console.warn("Missing customer on checkout session", session.id);
    return;
  }

  await prisma.user.update({
    where: { customerId },
    data: {
      subscriptionStatus: "active",
      subscriptionId: subId,
      priceId,
      ...(cardFingerprint && { paymentFingerprint: cardFingerprint }),
    },
  });

  console.log("✅ DB updated for customer", customerId);
  // NOTE: Subscription status is also updated immediately in the
  // /api/stripe/post-checkout route after successful checkout.
  // This handler ensures eventual consistency if that route fails
  // or if the status changes due to other events.
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const stripe = getStripe();
  console.log("Processing invoice payment succeeded:", invoice.id);
  try {
    const subscriptionId = getInvoiceSubscriptionId(invoice);
    const subscription = subscriptionId
      ? await stripe.subscriptions.retrieve(subscriptionId)
      : null;

    await prisma.user.update({
      where: { customerId: invoice.customer as string },
      data: {
        subscriptionStatus: subscription ? mapStripeStatusToPrisma(subscription.status) : "active",
      },
    });
    console.log(`Payment succeeded for customer: ${invoice.customer}`);
  } catch (error) {
    console.error("Error handling invoice payment success:", error);
  }
  // NOTE: See comment in handleCheckoutSessionCompleted regarding dual write paths.
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const stripe = getStripe();
  console.log("Processing invoice payment failed:", invoice.id);
  try {
    const subscriptionId = getInvoiceSubscriptionId(invoice);
    const subscription = subscriptionId
      ? await stripe.subscriptions.retrieve(subscriptionId)
      : null;
    await prisma.user.update({
      where: { customerId: invoice.customer as string },
      data: {
        subscriptionStatus: subscription ? mapStripeStatusToPrisma(subscription.status) : "past_due",
      },
    });
    console.log(`Payment failed for customer: ${invoice.customer}`);
  } catch (error) {
    console.error("Error handling invoice payment failure:", error);
  }
  // NOTE: See comment in handleCheckoutSessionCompleted regarding dual write paths.
}

async function handleInvoiceFinalized(invoice: Stripe.Invoice) {
  console.log("Processing invoice finalized:", invoice.id);
  try {
    await prisma.user.update({
      where: { customerId: invoice.customer as string },
      data: {
        subscriptionStatus: invoice.status === "paid" ? "active" : "past_due",
      },
    });
    console.log(`Invoice finalized for customer: ${invoice.customer}`);
  } catch (error) {
    console.error("Error handling invoice finalization:", error);
  }
  // NOTE: See comment in handleCheckoutSessionCompleted regarding dual write paths.
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const invoiceWithDetails = invoice as Stripe.Invoice & {
    subscription_details?: {
      subscription?: string | Stripe.Subscription | null;
    } | null;
  };
  const subscriptionFromDetails =
    invoiceWithDetails.subscription_details?.subscription;
  if (typeof subscriptionFromDetails === "string") {
    return subscriptionFromDetails;
  }
  if (
    subscriptionFromDetails &&
    typeof subscriptionFromDetails === "object" &&
    "id" in subscriptionFromDetails
  ) {
    return (subscriptionFromDetails as Stripe.Subscription).id;
  }

  const legacy = (
    invoice as unknown as {
      subscription?: string | Stripe.Subscription | null;
    }
  ).subscription;
  if (typeof legacy === "string") {
    return legacy;
  }
  if (legacy && typeof legacy === "object" && "id" in legacy) {
    return (legacy as Stripe.Subscription).id;
  }
  return null;
}
