"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { logEvent } from "@/shared/utils/analytics";
import Link from "next/link";
import { shouldTrackPurchase } from "@/shared/utils/paid-access.mjs";

export default function SubscriptionSuccess() {
  const router = useRouter();
  const { update } = useSession();

  useEffect(() => {
    console.log("[SubscriptionSuccess] Triggering session update...");
    update()
      .then((fresh) => {
        if (shouldTrackPurchase(fresh?.user)) logEvent("stripe_subscription_success");
        console.log(
          "[SubscriptionSuccess] Session updated successfully. Redirecting to /home..."
        );
        router.replace("/home");
      })
      .catch((error) => {
        console.error("[SubscriptionSuccess] Session update failed:", error);
        router.replace("/home");
      });
  }, [router, update]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="text-center mb-12">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-8 h-8 text-green-600"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Welcome!
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Your subscription is now active. We&apos;re preparing your workspace...
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
                    Premium Features Unlocked
                  </h3>
                  <p className="text-gray-600">
                    Full access to all premium tools and capabilities
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
                    Priority Support
                  </h3>
                  <p className="text-gray-600">
                    Get help when you need it with premium support
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
                    Regular Updates
                  </h3>
                  <p className="text-gray-600">
                    Access to new features and improvements
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center items-center">
              <div className="text-center">
                <div className="mb-6">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">
                    Preparing your workspace...
                  </p>
                </div>
                <Link
                  href="/home"
                  className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Go to Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-sm text-gray-500">
          <p>
            Need help getting started? Check out our documentation or contact
            support
          </p>
        </div>
      </div>
    </main>
  );
}
