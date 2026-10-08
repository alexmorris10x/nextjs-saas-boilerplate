import React, { Suspense } from "react";
import type { Session } from "next-auth";
import Script from "next/script";
import ToastViewport from "@/shared/toast/ToastViewport";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "./providers";
import ErrorTrackingProvider from "./providers/ErrorTrackingProvider";
import ClientLayout from "./ClientLayout";

interface AppShellProps {
  children: React.ReactNode;
  initialSession: Session | null;
}

export default function AppShell({ children, initialSession }: AppShellProps) {
  const cloudflareAnalyticsToken =
    process.env.NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN;

  return (
    <Suspense fallback={null}>
      <ErrorTrackingProvider>
        <Providers session={initialSession}>
          <ClientLayout>{children}</ClientLayout>
        </Providers>

        {/* {process.env.NODE_ENV === "development" && <ToastViewport />} */}
        <ToastViewport />

        {/** Plausible deferred via DeferThirdParties */}
        <SpeedInsights />
        <Analytics />
        {process.env.VERCEL_ENV === 'production' && cloudflareAnalyticsToken ? (
          <Script
            strategy="afterInteractive"
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({
              token: cloudflareAnalyticsToken,
              spa: true,
            })}
          />
        ) : null}
      </ErrorTrackingProvider>
    </Suspense>
  );
}
