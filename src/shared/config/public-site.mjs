/** The public identity and public-page inventory live in this one configuration. */
export function createPublicSiteConfig({ name, description, url } = {}) {
  const appName = name?.trim() || "Your App";
  const appDescription = description?.trim() ||
    "A production-ready SaaS application built with Next.js";
  let baseUrl;
  try {
    const parsed = new URL(url || "http://localhost:3000");
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid site URL");
    // Public canonical URLs must never contain credentials, queries or fragments.
    baseUrl = parsed.origin;
  } catch {
    baseUrl = "http://localhost:3000";
  }
  return {
    name: appName,
    title: appName,
    description: appDescription,
    url: baseUrl,
    shareImage: "/og-image.png",
    publicPages: [
      {
        path: "/",
        title: appName,
        description: appDescription,
        changeFrequency: "weekly",
        priority: 1,
      },
      {
        path: "/pricing",
        title: `Pricing | ${appName}`,
        description: "Start free, upgrade when you need more features.",
        changeFrequency: "monthly",
        priority: 0.8,
      },
    ],
  };
}

export const publicSite = createPublicSiteConfig({
  name: process.env.NEXT_PUBLIC_APP_NAME,
  description: process.env.NEXT_PUBLIC_APP_DESCRIPTION,
  url: process.env.NEXT_PUBLIC_APP_URL || process.env.SITE_URL,
});

export function getPublicPageMetadata(path = "/", site = publicSite) {
  const page = site.publicPages.find((entry) => entry.path === path);
  if (!page) throw new Error(`Public metadata is not configured for ${path}`);
  const canonical = new URL(page.path, site.url).href;
  const image = {
    url: site.shareImage,
    width: 1200,
    height: 630,
    alt: site.name,
    type: "image/png",
  };
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical },
    openGraph: {
      title: page.title,
      description: page.description,
      url: canonical,
      siteName: site.name,
      locale: "en_US",
      type: "website",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [site.shareImage],
    },
  };
}

export function getPublicRobots(site = publicSite) {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      // No trailing slash: block the actual /dashboard and /settings pages too.
      disallow: ["/api/", "/app", "/dashboard", "/settings", "/auth", "/pass/"],
    }],
    sitemap: `${site.url}/sitemap.xml`,
  };
}

export function getPublicSitemap(site = publicSite) {
  return site.publicPages.map((page) => ({
    url: new URL(page.path, site.url).href,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
