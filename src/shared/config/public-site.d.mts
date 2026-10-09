import type { Metadata, MetadataRoute } from "next";

export type PublicSiteConfig = {
  name: string;
  title: string;
  description: string;
  url: string;
  shareImage: string;
  publicPages: {
    path: string;
    title: string;
    description: string;
    changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
    priority: number;
  }[];
};
export function createPublicSiteConfig(input?: {
  name?: string;
  description?: string;
  url?: string;
}): PublicSiteConfig;
export const publicSite: PublicSiteConfig;
export function getPublicPageMetadata(path?: string, site?: PublicSiteConfig): Metadata;
export function getPublicRobots(site?: PublicSiteConfig): MetadataRoute.Robots;
export function getPublicSitemap(site?: PublicSiteConfig): MetadataRoute.Sitemap;
