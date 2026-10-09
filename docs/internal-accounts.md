# Internal accounts

Set the server-only `INTERNAL_ACCOUNT_EMAILS` variable to comma-separated email addresses. Matching trims spaces and ignores case; an empty variable grants no internal access.

Example: `INTERNAL_ACCOUNT_EMAILS="owner@example.com, test@example.com"`.

`isInternalAccount(email)` lives in `src/shared/utils/internal-account.mjs`; the server-only access facade is `src/shared/utils/access.server.ts`. `hasPaidAccess(user)` grants access for an internal account, an active subscription, lifetime access, or a future `compUntil`.

An internal account never needs to pay itself. Signup creates no Stripe object, and checkout refuses internal, lifetime and currently complimentary feedback accounts. RouteRev purchase tracking rejects internal and feedback accounts. Do not count them as customers, payers or revenue; use the same internal-account exclusion list in the real product's RouteRev setup.

Only a server-computed `isInternal` boolean is put in the session. The comma-separated list is not public config and must not be prefixed with `NEXT_PUBLIC_`. Middleware reevaluates the server list for each request; changing it requires normal deployment of the copied app's server environment.

Feedback-pass accounts receive temporary access independently from this list. Their grant never creates a Stripe subscription or card requirement. See [the blueprint](SPEC.md) for pass capacity, expiry and idempotence rules.
