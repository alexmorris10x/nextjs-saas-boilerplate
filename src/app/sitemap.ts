import type { MetadataRoute } from "next";
import { getPublicSitemap } from "@/shared/config/public-site.mjs";

/** Add real public pages to publicSite.publicPages, never private app routes. */
export default function sitemap(): MetadataRoute.Sitemap {
  return getPublicSitemap();
}
