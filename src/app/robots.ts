import type { MetadataRoute } from "next";
import { getPublicRobots } from "@/shared/config/public-site.mjs";

/** Crawling rules are not an access control; private pages still require auth. */
export default function robots(): MetadataRoute.Robots {
  return getPublicRobots();
}
