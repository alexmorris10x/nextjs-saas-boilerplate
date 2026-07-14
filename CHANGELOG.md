# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CI smoke guardrails for checkout/webhook/security-header baseline:
  - `scripts/ci-smoke-guardrails.mjs`
  - `.github/workflows/ci-smoke-guardrails.yml`
  - `npm run ci:smoke` package script
- README production checklist updates for local + CI smoke guardrail usage.
- Canonical project links now point to `alexmorris10x`; OSS security reporting, support, ownership, dependency maintenance, and workflow permissions are explicit.

## [1.0.0] - 2025-01-15

### Added
- Initial release of Next.js SaaS Boilerplate
- NextAuth.js authentication with Google and GitHub providers
- Stripe billing integration with subscriptions and webhooks
- Prisma ORM with PostgreSQL schema
- PostHog and Vercel Analytics integration
- TailwindCSS + DaisyUI component library
- Full TypeScript support
- SEO-ready with Next.js metadata API
- Example landing page and pricing page
- Dashboard and settings pages
- Toast notification system
- GitHub templates and CI workflow
