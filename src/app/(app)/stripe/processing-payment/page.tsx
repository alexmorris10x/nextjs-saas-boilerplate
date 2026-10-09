/* ---------------------------------------------------------------------
 * Route:  /stripe/processing-payment          (App Router)
 * Purpose: Force-refresh the NextAuth session after Stripe Checkout
 *          and send the user onward as soon as the subscription is live.
 * -------------------------------------------------------------------- */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/shared/types/user.types";
import { hasSessionPaidAccess } from "@/shared/utils/paid-access.mjs";
import type { SubscriptionStatus } from "@/shared/types/enum/subscript-status.enum";

export default function ProcessingPaymentPage() {
  const router = useRouter();
  const { status, update, data: session } = useSession();

  const [refreshAttempts, setRefreshAttempts] = useState(0);
  const [statusMessage, setStatusMessage] = useState(
    "Confirming your subscription..."
  );

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;
    let pollTimer: NodeJS.Timeout | null = null;

    const checkSubscriptionStatus = async () => {
      if (cancelled) return;

      try {
        setStatusMessage("Refreshing your session...");
        const fresh = await update();

        if (cancelled) return;
        if (!fresh) {
          setStatusMessage("Session update failed, retrying...");
          setRefreshAttempts((prev) => prev + 1);
          return;
        }

        const subStatus = (fresh.user as SessionUser)?.subscriptionStatus as
          | SubscriptionStatus
          | undefined;

        console.log(
          `[ProcessingPayment] Got session with status: ${subStatus}`
        );

        if (hasSessionPaidAccess(fresh.user)) {
          router.replace("/dashboard");
          return;
        }

        switch (subStatus) {
          case "active":
            setStatusMessage("Subscription active! Redirecting to home...");
            router.replace("/home");
            break;
          case "canceled":
          case "past_due":
            if (refreshAttempts >= 2) {
              setStatusMessage("Subscription issue detected.");
              router.replace("/stripe/subscription-expired");
            } else {
              checkDatabaseStatus();
            }
            break;
          default:
            if (refreshAttempts === 0) {
              setRefreshAttempts((prev) => prev + 1);
              checkDatabaseStatus();
            } else {
              setStatusMessage(
                `Waiting for subscription confirmation (attempt ${
                  refreshAttempts + 1
                })...`
              );
              setRefreshAttempts((prev) => prev + 1);
            }
            break;
        }
      } catch (error) {
        console.error("Error refreshing session:", error);
        setStatusMessage("Checking subscription status...");
        checkDatabaseStatus();
      }
    };

    const checkDatabaseStatus = async () => {
      if (cancelled) return;

      try {
        setStatusMessage("Checking subscription in database...");
        const response = await fetch("/api/user/subscription-status", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (cancelled) return;

        if (response.ok) {
          const data = await response.json();
          console.log(`[ProcessingPayment] DB check: ${data.status}`);

          if (data.hasPaidAccess || data.status === "trialing") {
            setStatusMessage(
              "Subscription confirmed in database! Redirecting..."
            );
            router.replace("/home");
            return;
          }

          if (refreshAttempts >= 3) {
            router.replace("/stripe/subscription-expired");
            return;
          }
        }

        setRefreshAttempts((prev) => prev + 1);
      } catch (error) {
        console.error("Error checking DB status:", error);
        setStatusMessage("Still processing your payment...");
      }
    };

    checkSubscriptionStatus();

    pollTimer = setInterval(() => {
      if (refreshAttempts >= 10) {
        clearInterval(pollTimer!);
        setStatusMessage(
          "Taking longer than expected, but your payment was received..."
        );
        fetch("/api/user/subscription-status")
          .then((response) => response.json())
          .then((data) => {
            console.log(
              `[ProcessingPayment] Final DB check: ${JSON.stringify(data)}`
            );
            router.replace("/home");
          })
          .catch(() => {
            router.replace("/home");
          });
        return;
      }
      checkSubscriptionStatus();
    }, 3000);

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [status, update, router, refreshAttempts]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="text-center mb-12">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-8 h-8 text-blue-600"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Processing Your Payment
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              We&apos;re confirming your subscription details. This usually takes
              just a few moments.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 mb-12">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-6 h-6 text-blue-600">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Secure Processing
                  </h3>
                  <p className="text-gray-600">
                    Your payment is being processed securely
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-6 h-6 text-blue-600">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Instant Access
                  </h3>
                  <p className="text-gray-600">
                    You&apos;ll have immediate access once confirmed
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-6 h-6 text-blue-600">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Automatic Redirect
                  </h3>
                  <p className="text-gray-600">
                    We&apos;ll take you to your workspace automatically
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center items-center">
              <div className="text-center">
                <div className="mb-6">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">{statusMessage}</p>
                </div>
                {refreshAttempts > 3 && (
                  <p className="text-sm text-amber-600">
                    This is taking longer than expected. Please be patient as we
                    confirm your payment.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-sm text-gray-500">
          <p>Need help? Our support team is here to assist you</p>
        </div>
      </div>
    </main>
  );
}
