'use client';

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SubscriptionStatus } from "@prisma/client";
import { identifyUser } from "@/shared/analytics/routerev.client";
import DeferThirdParties from "./DeferThirdParties";

/**
 * Client-side layout component that provides a safety net polling mechanism
 * to check for subscription status changes.
 *
 * This ensures that even long-lived tabs without navigation will eventually
 * reflect subscription status changes.
 */
export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const sessionUser = session?.user as
    | {
        id?: string;
        email?: string | null;
        plan?: string | null;
        subscriptionStatus?: SubscriptionStatus;
        createdAt?: string | null;
      }
    | undefined;

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!sessionUser?.id) return;

    identifyUser({
      id: sessionUser.id,
      email: sessionUser.email ?? null,
      plan: sessionUser.plan ?? sessionUser.subscriptionStatus ?? null,
      createdAt: sessionUser.createdAt ?? null,
    });
  }, [
    status,
    sessionUser?.id,
    sessionUser?.email,
    sessionUser?.plan,
    sessionUser?.subscriptionStatus,
    sessionUser?.createdAt,
  ]);

  // Safety net polling to detect subscription status changes
  useEffect(() => {
    // Skip if user isn't authenticated yet
    if (status !== 'authenticated') return;

    // Setup polling interval (15 minutes)
    const interval = setInterval(async () => {
      try {
        // Force a session refresh
        const freshSession = await update();

        // Check if subscription is expired/canceled and redirect if needed
        if (
          freshSession?.user?.subscriptionStatus === SubscriptionStatus.expired ||
          freshSession?.user?.subscriptionStatus === SubscriptionStatus.canceled ||
          freshSession?.user?.subscriptionStatus === SubscriptionStatus.past_due
        ) {
          console.log('[ClientLayout] Detected inactive subscription during polling, redirecting to subscription-expired');
          router.replace('/stripe/subscription-expired');
        }
      } catch (error) {
        console.error('[ClientLayout] Error during session polling:', error);
      }
    }, 15 * 60 * 1000); // 15 minutes

    return () => clearInterval(interval);
  }, [status, update, router]);

  return (
    <>
      <DeferThirdParties />
      {children}
    </>
  );
}
