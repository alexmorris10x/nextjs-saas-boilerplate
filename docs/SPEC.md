# Next.js SaaS boilerplate blueprint

Version 1, 2026-10-09. Owner: Alex. Agents: update this file in the same change whenever you change a feature, screen, price or rule.

## 1. The product in one minute

This repository is reusable source scaffolding for new web apps.
It gives a developer authentication, billing, persistence and growth-ready parts.
It is a template, with placeholder product copy and example pricing.
It replaces rebuilding the same shared SaaS plumbing for every app.
A cloned app supplies its own name, audience, screenshots, prices and integrations.
This template build does not deploy or migrate any existing live app.

## 2. Rules for anyone changing it

### Scope and ownership

- Keep Next.js, next-auth v4 Google sign-in, Prisma and the existing test setup.
- Change only this repository when updating the template.
- Do not configure provider accounts, credentials or production databases here.
- Preserve the repository's current guardrail and global development workflow.
- Make changes in a separate worktree and independently review before merging.
- `main` is the development source; production release is separate.
- Existing copied apps do not automatically receive template changes.

### Access and measurements

- All paid-tier access decisions use the shared entitlement implementation.
- Internal accounts receive full access without billing.
- A complimentary grant never creates a Stripe customer or subscription.
- Feedback access expires according to `compUntil`, evaluated at request time.
- Internal accounts and feedback grants are not purchases or customer traction.
- Do not expose the internal-email list in client configuration.
- Retain existing trial behavior while using the common entitlement rules.

### Persistence and privacy

- First-touch fields are written only when the account is created.
- A later campaign or direct visit cannot replace an earlier visit.
- Feedback capacity is atomically reserved with the user update and ledger.
- A user can redeem the same code only once, including after another code.
- Waitlist emails are normalized before enforcing the unique constraint.
- Confirmation delivery is recorded only after Postmark succeeds.
- No provider call is needed to run the offline unit tests.
- Test databases must be isolated, local and contain only synthetic fixtures.

### Documentation and verification

- This blueprint is the current feature/rule reference.
- `CONTEXT.md` is the glossary, not an implementation spec.
- Update public placeholder copy before using this as a real product.
- Run lint, node unit tests and the smoke guardrail before merging.
- Check the built metadata endpoints locally when changing public routing.
- Apply migrations to a fresh local database before accepting schema changes.
- Keep private-repository Actions disabled; local checks are the gate.

## 3. Features

### Foundation

- Next.js App Router starter · scaffolded · `src/app/`
- Google OAuth and JWT sessions · scaffolded · `src/shared/auth/authOptions.ts`
- Safe Prisma adapter wrapper · scaffolded · `src/shared/auth/authOptions.ts`
- PostgreSQL models and migrations · scaffolded · `prisma/`
- Neon serverless runtime adapter · scaffolded · `src/shared/utils/database.utils.ts`
- Stripe Checkout · scaffolded · `src/app/api/stripe/create-checkout-session/route.ts`
- Stripe portal · scaffolded · `src/app/api/stripe/create-portal/route.ts`
- Idempotent Stripe webhook · scaffolded · `src/app/api/webhook/stripe/route.ts`
- Postmark transactional delivery · scaffolded · `src/shared/utils/postmark.utils.ts`
- Error tracking · optional · `src/app/providers/ErrorTrackingProvider.tsx`
- RouteRev hook · optional · `src/shared/analytics/routerev.client.ts`

### Internal accounts and full access

- Internal email parsing · implemented · `src/shared/utils/internal-account.mjs`
- Server access helper · implemented · `src/shared/utils/access.server.ts`
- Shared dated entitlement rules · implemented · `src/shared/utils/paid-access.mjs`
- Middleware and app paywalls · implemented · `src/middleware.ts`, billing/layout consumers
- Account configuration guide · implemented · `docs/internal-accounts.md`
- Checkout remains lazy; signup itself does not create Stripe objects.
- Internal and feedback access are filtered from RouteRev purchase tracking.

### Feedback invitations

- Case-insensitive `/pass/<code>` entry · implemented · `src/app/pass/`
- Pending one-hour cookie for Google sign-in · implemented · pass route helpers
- Transactional redemption · implemented · `src/shared/utils/feedback-pass.mjs`
- Per-user/per-code redemption ledger · implemented · `FeedbackPassRedemption`
- Cookie/session refresh after redemption · implemented · pass completion route
- Complimentary-access banner · implemented · `src/features/feedback/`
- Pass creation CLI · implemented · `scripts/create-pass.mjs`
- Pass defaults: three months, 100 uses, no expiry unless supplied.
- No pass admin UI, Stripe object, card collection or paid subscription.

### First-touch attribution

- First-visit capture · implemented · `src/shared/utils/first-touch-attribution.mjs`
- HTTP-only 30-day cookie · implemented · middleware capture bridge
- Empty first visit is preserved as direct/unknown attribution.
- The captured keys are `ref`, `utm_source`, `utm_medium`, `utm_campaign`.
- New-user fields are `signupRef`, `signupUtmSource`, `signupUtmMedium`, `signupUtmCampaign`.
- Auth reads the cookie when creating the account; later sign-ins leave fields alone.
- Values are bounded and parsed defensively; invalid cookies do not crash signup.

### Public discovery

- Public title/description/URL config · implemented · `src/shared/config/public-site.mjs`
- Open Graph and Twitter metadata · implemented · `src/app/layout.tsx`
- Default 1200×630 share image · implemented · `public/og-image.png`
- Deterministic image source · implemented · `scripts/generate-share-image.mjs`
- Public-only sitemap · implemented · `src/app/sitemap.ts`
- Authenticated/API crawl restrictions · implemented · `src/app/robots.ts`
- LLM discovery placeholder · implemented · `public/llms.txt`
- Product name, audience and key pages remain placeholders for each new app.

### Prelaunch waitlist

- Real email form · implemented, opt-in · `src/core/components/Button/ButtonLead.tsx`
- Public signup endpoint · implemented · `src/app/api/waitlist/route.ts`
- Validation and idempotent persistence · implemented · `src/shared/utils/waitlist.mjs`
- Bounded local rate limit · implemented · waitlist service
- Local limits: five/client and 100 total per ten minutes per process; at most 1,024 active keys.
- Postmark confirmation · implemented · Postmark helper/sender
- DB-backed delivery lease · implemented · `WaitlistSignup` confirmation fields
- Default flag is off: `NEXT_PUBLIC_WAITLIST_ENABLED=false`.
- Disabled form is hidden and disabled API refuses new signup requests.
- Failed delivery releases the lease so a later duplicate request can retry.
- Postmark timeout is ten seconds; abandoned claims become retryable after five minutes.
- A provider timeout after acceptance can cause an ambiguous retry; this is not an exactly-once mail guarantee.
- Duplicate success does not insert another row or send another confirmation.

## 4. Screens

### `/`: public landing page

- Introduces the starter and links to pricing and Google sign-in.
- Product copy is scaffolding that a new app replaces.
- Calls to action include "Get Started" and "View Pricing".
- Public page metadata comes from the shared app config.
- A prelaunch app can use `ButtonLead` when its flag is enabled.

### `/pricing`: public example pricing

- Shows the starter's configured/example plans.
- Links to the existing checkout flow.
- Actual Stripe price identifiers are supplied by the copied app.
- This spec does not change billing amounts or create provider prices.

### Google sign-in

- Uses the existing Google next-auth provider.
- No new auth method is introduced.
- Feedback entry preserves its pending code for one hour.
- The completion path returns to the app's actual home, `/dashboard`.

### `/dashboard`: app home

- Authenticated starter screen with welcome card and placeholder statistics.
- Links to Settings and subscription details.
- Feedback access displays "You have free access until <date>. Thanks for helping."
- The grant is read from the account, not a trusted query-string expiry.

### `/settings`: starter account settings

- Shows the signed-in profile and existing settings/billing scaffolding.
- Access labels use the shared entitlement result.
- Product-specific profile editing behavior remains for the copied app.

### `/pass/[code]`: feedback entry

- Accepts codes case-insensitively and stores canonical uppercase codes.
- Signed-out valid links preserve the code before Google sign-in.
- Signed-in valid links redeem and refresh the session before the dashboard.
- Invalid, expired and full links show the same plain inactive-link message.
- Exact message: "This link isn't active any more. Ask the person who sent it for a new one."
- A repeated redemption cannot consume another slot or extend the same grant again.

### Stripe flow screens

- `/stripe/processing-payment`: waits for the existing billing flow.
- `/stripe/subscription-success`: confirms existing subscription state.
- `/stripe/subscription-expired`: existing inactive-subscription screen.
- `/stripe/trial-offer`: existing starter trial offer.
- `/stripe/cancel` and `/stripe/post-portal`: existing billing return routes.
- These routes do not determine access independently from the common helper.

### Waitlist form

- Input is an email address; submit copy is "Join waitlist".
- Successful confirmation shows "Thanks for joining the waitlist!".
- It is a prelaunch contact signup, not an authenticated user or purchase.
- Loading and duplicate submissions are handled without a second row.

## 5. Pricing and access

### Billing

- Example pricing is template scaffolding; each product decides its actual plans.
- Existing Stripe Checkout enables promotion codes.
- The webhook remains the existing idempotent billing-state writer.
- Creating an account alone does not imply a paying customer.
- Provider/account configuration is outside this template spec.

### Full-access rules

- An internal email receives full access without Stripe.
- An active subscription receives full access.
- Lifetime access receives full access.
- A future `compUntil` receives full access.
- Existing trial behavior is preserved by the common access implementation.
- An expired complimentary date alone does not give full access.
- Dates are reevaluated against current time, including middleware/client display.

### Feedback-pass rules

- Defaults: three calendar months and 100 successful distinct-user redemptions.
- An optional `expiresAt` controls whether new redemptions are allowed.
- Capacity cannot exceed `maxUses`, including concurrent requests.
- Redeeming sets `compUntil` to the later of its existing date and now plus months.
- A currently paying account keeps its existing `accessSource`.
- Other feedback recipients get `accessSource="feedback"` and canonical code.
- A durable ledger makes the same user's repeat code redemption idempotent.
- No recurring billing begins when feedback access ends.

## 6. Standard parts

| # | Part | Status | Note |
|---|------|--------|------|
| 1 | Dev and production | Scaffolded | `main` is development source; copied app owns deployment configuration |
| 2 | Project setup | Scaffolded | Next.js 16, Google next-auth, Prisma/Neon, npm, local lint/unit/smoke, `vercel.json` iad1 |
| 3 | Payments | Scaffolded | Stripe Checkout promotion codes and idempotent `/api/webhook/stripe` |
| 4 | Our own accounts excluded | Implemented | `INTERNAL_ACCOUNT_EMAILS`, common access, purchase filtering, `docs/internal-accounts.md` |
| 5 | Email | Scaffolded | Existing Postmark helper; waitlist confirmation with mocked tests |
| 6 | Public page | Implemented placeholders | Shared config, share image, robots, sitemap, llms; replace product copy/screenshots |
| 7 | Ready to measure | Implemented hook | RouteRev client hook and immutable signup attribution; product registration happens later |
| 8 | Feedback pass | Implemented | `/pass/[code]`, atomic capacity, durable redemption ledger, create-pass CLI |
| 9 | Waitlist | Implemented, opt-in | ButtonLead, validated/rate-limited `/api/waitlist`, Postmark, normalized unique email |
| 10 | Referral | Not now | Not designed by the app standard |
| 11 | Affiliate | Not now | Wait until the growth turn requires it |
| 12 | The blueprint | Implemented | `docs/SPEC.md` and glossary `CONTEXT.md` |
| 13 | Clean repo | Existing guardrail retained | No new instruction files; pre-existing root `AGENTS.md` remains authoritative |

## 7. Not now

- Retrofitting any live app, including Surgr or RouteRev.
- Referral or affiliate systems.
- A feedback-pass admin UI.
- Stripe price, checkout or webhook changes beyond shared entitlement use.
- Replacing next-auth, Prisma or the node-test/smoke setup.
- New authentication methods.
- Provider signup, credentials, auth configuration or production migrations.
- Actual confirmation emails during template acceptance.
- Registering this template as a product in RouteRev.
- Product positioning, custom screenshots or marketing decisions.

## 8. Decided

- 2026-10-09: feedback passes grant three months, no card and no customer count.
- 2026-10-09: transactional email is Postmark.
- 2026-10-09: tests are `node --test` and `ci:smoke`; browser tests only for flows that need them.
- 2026-10-09: use the existing Google sign-in, with no new auth methods.
- 2026-10-09: pass codes are case-insensitive and stored uppercase.
- Engineering: a redemption ledger preserves idempotence when a user redeems multiple codes.
- Engineering: baseline migration supports brand-new databases; existing databases need normal baseline handling.
- Engineering: confirmation leases allow retry after delivery failure while suppressing concurrent duplicates.

### Open questions for Alex

No product decision blocks this agreed template spec.
Each new product supplies its own audience, public copy, screenshots and prices.
