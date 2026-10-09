import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createPublicSiteConfig,
  getPublicPageMetadata,
  getPublicRobots,
  getPublicSitemap,
} from "../src/shared/config/public-site.mjs";

const site = createPublicSiteConfig({ name: " Example App ", description: " An app for examples ", url: "https://example.com/path/?ref=secret#fragment" });

test("one configuration supplies root, landing and share metadata", () => {
  assert.equal(site.name, "Example App");
  assert.equal(site.description, "An app for examples");
  assert.equal(site.url, "https://example.com");
  const metadata = getPublicPageMetadata("/", site);
  assert.equal(metadata.title.absolute, site.title);
  assert.equal(metadata.description, site.description);
  assert.equal(metadata.openGraph.title, site.title);
  assert.equal(metadata.openGraph.description, site.description);
  assert.equal(metadata.twitter.title, site.title);
  assert.equal(metadata.twitter.description, site.description);
  assert.equal(metadata.alternates.canonical, "https://example.com/");
  assert.deepEqual(metadata.openGraph.images[0], { url: "/og-image.png", width: 1200, height: 630, alt: site.name, type: "image/png" });
  assert.deepEqual(metadata.twitter.images, [site.shareImage]);
});

test("pricing keeps its correct canonical and shares the same default image", () => {
  const metadata = getPublicPageMetadata("/pricing", site);
  assert.equal(metadata.alternates.canonical, "https://example.com/pricing");
  assert.equal(metadata.openGraph.url, "https://example.com/pricing");
  assert.equal(metadata.title.absolute, "Pricing | Example App");
  assert.equal(metadata.openGraph.images[0].url, site.shareImage);
  assert.throws(() => getPublicPageMetadata("/dashboard", site), /not configured/);
});

test("site origin normalization avoids duplicate slashes and private URL data", () => {
  for (const url of ["https://example.com", "https://example.com/", "https://example.com//?anything=1", "https://user:password@example.com/private"]) {
    assert.equal(createPublicSiteConfig({ url }).url, "https://example.com");
  }
  for (const url of ["javascript:alert(1)", "not-a-url", "ftp://example.com", ""]) {
    assert.equal(createPublicSiteConfig({ url }).url, "http://localhost:3000");
  }
});

test("sitemap contains only real public pages and no fabricated modified timestamps", () => {
  const sitemap = getPublicSitemap(site);
  assert.deepEqual(sitemap.map((page) => page.url), ["https://example.com/", "https://example.com/pricing"]);
  assert.ok(sitemap.every((page) => !("lastModified" in page)));
});

test("robots blocks exact authenticated URLs and publishes the normalized sitemap URL", () => {
  const robots = getPublicRobots(site);
  assert.equal(robots.sitemap, "https://example.com/sitemap.xml");
  assert.equal(robots.rules[0].allow, "/");
  for (const privatePath of ["/dashboard", "/dashboard/child", "/settings", "/api/private", "/pass/FEEDBACK"]) {
    assert.ok(robots.rules[0].disallow.some((prefix) => privatePath.startsWith(prefix)), privatePath);
  }
});

test("llms.txt carries the requested public placeholders and page inventory", () => {
  const text = readFileSync(new URL("../public/llms.txt", import.meta.url), "utf8");
  assert.match(text, /\[App name\]/);
  assert.match(text, /One-line description/);
  assert.match(text, /Who it's for/);
  assert.match(text, /\[Home\]\(\/\)/);
  assert.match(text, /\[Pricing\]\(\/pricing\)/);
});

test("the default share image is a real 1200×630 PNG", () => {
  const image = readFileSync(new URL("../public/og-image.png", import.meta.url));
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(image.toString("ascii", 12, 16), "IHDR");
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});
