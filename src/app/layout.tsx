import "@/app/server";
import "@/app/styles/globals.css";
import { Metadata, Viewport } from "next";
import React from "react";
import Script from "next/script";

import { getPublicPageMetadata, publicSite } from "@/shared/config/public-site.mjs";

export const metadata: Metadata = {
  ...getPublicPageMetadata(),
  metadataBase: new URL(publicSite.url),
  title: {
    default: publicSite.title,
    template: `%s | ${publicSite.name}`,
  },
  manifest: "/manifest.json",
  icons: {
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
  },
  other: {
    "msapplication-TileColor": process.env.NEXT_PUBLIC_COLORS_MAIN || "#3B82F6",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Stripe loaded lazily - only needed on checkout/billing pages */}
        <Script src="https://js.stripe.com/v3/" strategy="lazyOnload" />

        {/** Analytics and third-parties deferred via DeferThirdParties component */}

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: publicSite.name,
              url: publicSite.url,
              logo: "/favicon-32x32.png",
            }),
          }}
        />

        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.getItem('theme')) {
                  document.documentElement.setAttribute('data-theme', localStorage.getItem('theme'));
                } else {
                  document.documentElement.setAttribute('data-theme', '${
                    process.env.NEXT_PUBLIC_COLORS_THEME || "dark"
                  }');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
