# App-standard template acceptance

Date: 2026-10-09. Source reviewed: `91c89bb`, based on GitHub main `e018414`.

## Scope

This changes the reusable template only. Existing live apps, provider account configuration, actual mail delivery and production databases were not used. All database fixtures and JWT secrets were synthetic and local.

## Checks

- `npm run lint`: pass (warnings only; no errors).
- `npm test`: pass, 60 offline/source tests; five opt-in PostgreSQL tests skip when no fixture URL is supplied.
- `npm run type-check`: pass.
- `npm run ci:smoke`: pass; anonymous checkout 401, webhook missing/invalid signatures 400, required security/CSP headers present.
- `npm run build`: optimized production build passes.
- Local production HTTP: `/`, `/pricing`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/og-image.png` all return 200.
- Anonymous disabled `POST /api/waitlist`: 404 from the real handler, rather than an auth redirect.
- First-touch document request: expected cookie is set.
- Fresh PostgreSQL 17 fixture: baseline and app-standard migrations both apply, schema up to date.
- Five real PostgreSQL cases: last-slot race, duplicate-user race, simultaneous codes, paying/longer grant and transaction rollback all pass. Forced serialization conflicts confirm retry behavior.
- `scripts/create-pass.mjs`: real fixture pass created with canonical uppercase code, three months/100 slots, and the correct full `/pass/ACCEPTANCE_CREATE` link printed.
- Actual source handlers: Google adapter first-insert attribution, later sign-in immutability, pending pass cookie, post-sign-in redemption and standard/secure/chunked JWT replacement pass with database/provider boundaries mocked.
- Actual React banner: feedback, paying and lifetime redeemers get the required dated banner; expired or absent grants do not.
- Actual waitlist route/repository/Postmark wrapper: new, duplicate, invalid and disabled cases pass with mocked database/Postmark clients.
- Test-loader compatibility: focused source tests pass with `require(esm)` disabled, preserving the advertised Node 20.9 baseline.

## Independent review

The independent reviewer checked all seven build steps, the full source/schema/docs diff and the bounded acceptance plan. Four findings were fixed and rechecked: anonymous waitlist middleware access, paying-user pass banners, billing-page robots exclusions, and the Node 20-compatible source-test loader. Final review is clean; 23 focused source/render cases passed independently.

## Reproduce

Run `npm ci`, `npm run lint`, `npm test`, `npm run type-check`, `npm run ci:smoke` and `npm run build`.

To run database cases, apply `prisma migrate deploy` to a brand-new local synthetic PostgreSQL database, then set `APP_STANDARD_TEST_DATABASE_URL` for `npm test`. The test guard requires a loopback host and a database name containing test, fixture, ci or acceptance. Never use a production database.

## Remaining operational boundary

The supported GitHub plugin cannot delete branch refs or create archive tags. Main integration can proceed after the passing gates; the task branch and nine pre-existing remote branches require a normal GitHub/dev-workflow cleanup by the authorized operator. Existing branches were preserved. This is the only unmet part of the spec's final cleanup check.
