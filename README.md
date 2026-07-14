# Next.js SaaS Boilerplate

A production-ready Next.js boilerplate with authentication, Stripe billing, and analytics — everything you need to ship your SaaS faster while following industry best practices.

## Why This Boilerplate?

Building a SaaS from scratch means making hundreds of decisions before writing your first feature. This boilerplate makes those decisions for you, based on:

- **Production experience** from real SaaS applications
- **Next.js best practices** for the App Router era (2024-2025)
- **Security-first design** to protect your users and revenue
- **Serverless-ready architecture** optimized for Vercel and similar platforms

Every pattern exists for a reason. This documentation explains not just *what* to do, but *why*.

## Features

| Feature | Implementation | Why This Approach |
|---------|---------------|-------------------|
| Authentication | NextAuth.js + JWT sessions | Stateless, serverless-friendly, no session table bloat |
| Payments | Stripe + webhook idempotency | Industry standard, handles edge cases correctly |
| Database | Prisma + Neon (serverless) | Type-safe ORM, scales to zero, no connection pooling needed |
| API Layer | Composable middleware stack | Validation, rate limiting, caching without repetition |
| State | Zustand + React Query | Local state simple, server state cached and synchronized |
| UI | TailwindCSS + DaisyUI | Utility-first CSS, pre-built accessible components |
| Analytics | PostHog + Vercel Analytics | Self-hostable product analytics + Web Vitals |
| Architecture | Enforced boundaries via ESLint | Prevents spaghetti code as codebase grows |

## Requirements

- **Node.js 18+** — Required for modern JavaScript features
- **PostgreSQL database** — Neon, Supabase, or self-hosted
- **Stripe account** — For payment processing
- **OAuth credentials** — Google (and optionally GitHub)

> **Why these requirements?** Node 18+ provides native fetch and modern async features. PostgreSQL is battle-tested for transactional SaaS workloads. Stripe handles PCI compliance so you don't have to.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/alexmorris10x/nextjs-saas-boilerplate.git
cd nextjs-saas-boilerplate

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your credentials

# Set up database
npx prisma db push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see your app.

## Documentation

| Document | Description |
|----------|-------------|
| [README.md](README.md) | This file — overview and quick start |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Deep dive into architectural decisions |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Guidelines for contributing |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [SECURITY.md](SECURITY.md) | Security policy and best practices |

---

## Project Structure

```
src/
├── app/                      # Next.js App Router
│   ├── (app)/               # Authenticated routes (dashboard, settings)
│   ├── (marketing)/         # Public pages (landing, pricing)
│   ├── api/                 # API routes with middleware
│   │   ├── _middleware/     # Composable middleware (rate limit, validation)
│   │   ├── _validation/     # Zod schemas
│   │   ├── auth/            # NextAuth routes
│   │   ├── stripe/          # Checkout, portal, webhooks
│   │   └── webhook/         # External webhooks
│   ├── actions/             # Server Actions for mutations
│   └── providers.tsx        # Client-side providers
├── core/                    # Core UI components
│   └── components/          # Buttons, modals, etc.
├── features/                # Feature-specific modules
│   ├── billing/             # Upgrade prompts, subscription UI
│   └── layout/              # Layout wrappers
├── shared/                  # Shared utilities
│   ├── auth/                # NextAuth configuration
│   ├── store/               # Zustand stores
│   ├── hooks/               # Custom React hooks
│   ├── utils/               # Helper functions
│   └── types/               # TypeScript definitions
└── lib/                     # Third-party integrations
    └── posthog/             # Analytics setup
```

### Why This Structure?

**Route Groups `(app)` and `(marketing)`**

```
app/
├── (app)/          # Requires authentication, uses app layout
│   ├── dashboard/
│   └── settings/
└── (marketing)/    # Public, uses marketing layout
    ├── page.tsx    # Landing page
    └── pricing/
```

Route groups (parentheses) allow different layouts without affecting URLs:
- `(marketing)/pricing` → `/pricing` (public, marketing layout)
- `(app)/dashboard` → `/dashboard` (authenticated, app layout)

**Why not just use middleware for layout switching?** Route groups are declarative and visible in the file system. You can see the separation at a glance.

**Enforced Boundaries**

```
core/       → Can only import from: shared, core
shared/     → Can only import from: shared, core
features/   → Can import from: shared, core, features
app/        → Can import from everything
```

ESLint's `eslint-plugin-boundaries` enforces these rules, preventing:
- Features importing from other features (coupling)
- Core components depending on features (inverted dependency)
- Circular imports that break code splitting

---

## Architecture Deep Dive

### Authentication with NextAuth.js

**Why JWT sessions over database sessions?**

| Aspect | Database Sessions | JWT Sessions |
|--------|-------------------|--------------|
| Scalability | Requires DB read on every request | Stateless, no DB needed |
| Serverless | Connection pool issues | Perfect fit |
| Session table | Grows with users | No table needed |
| Immediate invalidation | Yes | Requires refresh window |

For most SaaS apps, JWT's trade-offs are worth it. We use a 5-minute refresh window to balance security with performance.

**Token Enrichment Pattern**

```typescript
// Only fetch from DB on sign-in or explicit update
async jwt({ token, user, trigger }) {
  if (trigger === "signIn" || trigger === "update") {
    const dbUser = await prisma.user.findUnique({ where: { id: token.sub } });
    token.subscriptionStatus = dbUser?.subscriptionStatus;
    token.hasLifetimeAccess = dbUser?.hasLifetimeAccess;
  }
  return token;
}

// Session callback just reads from token (no DB query!)
async session({ session, token }) {
  session.user.subscriptionStatus = token.subscriptionStatus;
  return session;
}
```

**Why this matters:** Without this pattern, every `useSession()` call could trigger a database query. With it, session data is embedded in the JWT and never touches the database during normal operation.

### Stripe Integration

**Webhook Idempotency**

Stripe sends webhooks with at-least-once delivery. Without idempotency handling:
- User could be charged twice
- Subscription status could flip-flop
- Analytics events duplicated

Our solution:

```typescript
// Check if already processed
const existing = await prisma.subscriptionEvent.findUnique({
  where: { stripeEventId: event.id }
});
if (existing) return NextResponse.json({ received: true }); // Skip duplicate

// Process event
await handleSubscriptionUpdate(event);

// Record as processed
await prisma.subscriptionEvent.create({
  data: { stripeEventId: event.id, type: event.type, payload: event }
});
```

**Fraud Prevention**

```typescript
// Block disposable emails on checkout
const disposablePatterns = ['mailinator.com', 'tempmail.com', '10minutemail.com'];
if (disposablePatterns.some(p => email.includes(p))) {
  return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
}

// Block duplicate trials by card fingerprint
const existingTrial = await prisma.user.findFirst({
  where: { cardFingerprint: paymentMethod.card.fingerprint, trialUsed: true }
});
if (existingTrial) {
  // Skip trial, charge immediately
}
```

### API Middleware Stack

**Why composable middleware?**

Without middleware:
```typescript
// Every route repeats this
export async function POST(request: Request) {
  // Validate request
  const body = await request.json();
  const result = schema.safeParse(body);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });

  // Check rate limit
  const ip = request.headers.get('x-forwarded-for');
  const { success } = await ratelimit.limit(ip);
  if (!success) return NextResponse.json({ error: 'Rate limited' }, { status: 429 });

  // Finally, actual logic...
}
```

With middleware:
```typescript
export const POST = withMiddleware(
  async (request, { validated }) => {
    // Just the business logic
    return NextResponse.json({ success: true });
  },
  {
    validation: { schema: createItemSchema },
    rateLimit: { type: 'standard' },
  }
);
```

**Middleware order matters:**

```
Request → Monitoring → Rate Limit → Cache → Validation → Handler
```

- Monitoring first: Track all requests, even rejected ones
- Rate limit early: Don't waste CPU on abusive requests
- Cache before validation: Return cached response if available
- Validation last: Parse body only when necessary

### State Management

**Two types of state, two tools:**

| State Type | Tool | Example |
|------------|------|---------|
| Local/UI state | Zustand | Toast notifications, modal open/closed |
| Server state | React Query | User data, subscription status, API responses |

**Why Zustand over Redux/Context?**

```typescript
// Zustand: 3 lines, no provider needed
const useToastStore = create((set) => ({
  toasts: [],
  addToast: (toast) => set((s) => ({ toasts: [...s.toasts, toast].slice(-3) })),
}));

// Usage anywhere
const { addToast } = useToastStore();
addToast({ message: 'Saved!' });
```

No `<Provider>` wrapper, no action creators, no reducers. Just state and functions.

**Why React Query for server state?**

```typescript
// Without React Query
const [users, setUsers] = useState([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);

useEffect(() => {
  setLoading(true);
  fetch('/api/users')
    .then(r => r.json())
    .then(setUsers)
    .catch(setError)
    .finally(() => setLoading(false));
}, []);

// With React Query
const { data: users, isLoading, error } = useQuery({
  queryKey: ['users'],
  queryFn: () => fetch('/api/users').then(r => r.json()),
});
```

React Query also provides:
- Automatic caching (60s stale time)
- Background refetch on window focus
- Retry on failure
- Optimistic updates
- Cache invalidation

### Database Architecture

**Neon Serverless Driver**

Traditional PostgreSQL connections don't work well on serverless:
- Cold starts exhaust connection limits
- Connection pooling (PgBouncer) adds complexity
- Idle connections waste resources

Neon's HTTP driver solves this:
```typescript
import { neon } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';

const sql = neon(process.env.DATABASE_URL!);
const adapter = new PrismaNeon(sql);
const prisma = new PrismaClient({ adapter });
```

Each request uses HTTP, not a persistent connection. No pooling needed.

**Denormalized Subscription Data**

```prisma
model User {
  // ... auth fields

  // Denormalized from Subscription (for fast middleware checks)
  subscriptionStatus  SubscriptionStatus @default(new)
  subscriptionId      String?
  hasLifetimeAccess   Boolean @default(false)
}

model Subscription {
  // Full subscription details
  stripeSubId         String @unique
  status              SubscriptionStatus
  currentPeriodEnd    DateTime?
  // ... more fields
}
```

**Why duplicate data?** Middleware runs on every request and needs to check subscription status. Joining tables on every request is expensive. Reading `User.subscriptionStatus` is a single indexed lookup.

We update both on webhook events to maintain consistency.

---

## Configuration

### Environment Variables

```env
# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="Your SaaS"

# Database (Neon recommended for serverless)
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# Auth
NEXTAUTH_SECRET="openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_ID_MONTHLY="price_..."
STRIPE_PRICE_ID_YEARLY="price_..."

# Analytics (optional)
NEXT_PUBLIC_POSTHOG_KEY="phc_..."
NEXT_PUBLIC_POSTHOG_HOST="https://app.posthog.com"

# Rate Limiting (optional, but recommended for production)
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."
```

### OAuth Setup

**Google Cloud Console:**
1. Create OAuth 2.0 credentials
2. Add authorized redirect URI: `https://yourdomain.com/api/auth/callback/google`
3. Copy Client ID and Secret to `.env`

**Why Google OAuth?** Highest conversion rate (users trust it), lowest friction (one click), works everywhere.

### Stripe Setup

1. **Create products** in Stripe Dashboard
2. **Create prices** (monthly and/or yearly)
3. **Set up webhook** endpoint: `https://yourdomain.com/api/webhook/stripe`
4. **Select events** to listen for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `checkout.session.completed`

---

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Add environment variables in Vercel dashboard, then:
- Set up Stripe webhook with production URL
- Update `NEXTAUTH_URL` to production domain

**Why Vercel?** Zero-config for Next.js, automatic HTTPS, edge functions, built-in analytics.

### Docker

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
CMD ["node", "server.js"]
```

Build optimized for Docker with standalone output (configured in `next.config.ts`).

---

## Production standards checklist

Use this checklist before your first production release:

- [ ] Add production infrastructure secrets and environment variables:
  - `DATABASE_URL` points to production PostgreSQL
  - `NEXTAUTH_SECRET` and `NEXTAUTH_URL` are set for production host
  - Stripe secrets (`STRIPE_SECRET_KEY`, webhook secret, price IDs)
  - OAuth client credentials for active providers
- [ ] Run migration or deploy-safe schema strategy for all schema changes.
- [ ] Verify webhook endpoints in Stripe and Auth callback URLs are exact for your domain.
- [ ] Confirm core monitoring is active:
  - PostHog `$exception` capture is enabled by default in this repo (`capture_exceptions: true`).
  - Axiom logger transport is configured and sending logs from server/runtime paths.
- [ ] Deploy and validate runtime smoke checks:
  - Run `npm run ci:smoke` locally before merge to validate checkout/webhook/header guardrails.
  - Keep `.github/workflows/ci-smoke-guardrails.yml` enabled for push/PR validation.
  - Add required GitHub secrets for telemetry queries and Telegram notifications (details below).
  - Enable `.github/workflows/runtime-telemetry-alerts.yml` by setting repo variables.
  - Keep thresholds aligned with free-tier budgets and adjust with repository vars when needed.

### Runtime telemetry alerts setup (Telegram)

1. Keep the reusable workflow as-is at `.github/workflows/runtime-telemetry-alerts.template.yml`.
2. Enable the scheduled entrypoint `.github/workflows/runtime-telemetry-alerts.yml` in your repo (already present).
3. Set GitHub **Secrets**:
   - `POSTHOG_HOST` (optional, default `https://us.i.posthog.com`)
   - `POSTHOG_PROJECT_ID` (required for PostHog exception count)
   - `POSTHOG_PERSONAL_API_KEY` (required for PostHog queries)
   - `AXIOM_QUERY_DOMAIN` (optional, default `us-east-1.aws.edge.axiom.co`)
   - `AXIOM_API_TOKEN` (required for Axiom APL query)
   - `AXIOM_DATASET` (required for Axiom query)
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `TELEGRAM_THREAD_ID` (optional for forum-style topics)
4. Set GitHub **Variables**:
   - `RUNTIME_APP_NAME` (defaults to repo name)
   - `RUNTIME_BASE_URL` (your production app URL, e.g., `https://app.example.com`)
   - `RUNTIME_TELEMETRY_WINDOW_MINUTES` (default `60`)
   - `RUNTIME_POSTHOG_EXCEPTION_THRESHOLD` (default `5`)
   - `RUNTIME_AXIOM_ERROR_THRESHOLD` (default `5`)
   - `RUNTIME_AXIOM_ERROR_APL` (optional Axiom filter override)
   - `RUNTIME_HTTP_CHECKS_ENABLED` (default `true`)
   - `RUNTIME_ALERTS_ENABLED` (`true` to send Telegram alerts)
   - `RUNTIME_TELEMETRY_DRY_RUN` (`true` to evaluate without sending)

If `RUNTIME_ALERTS_ENABLED` is `false` or `RUNTIME_TELEMETRY_DRY_RUN` is `true`, the workflow evaluates thresholds but never sends Telegram messages (`no-alert` behavior).

For Axiom filtering defaults, start with:

```
level == "error" or severity == "error" or severity_text == "error"
```

This template expects `$exception` events from PostHog and Axiom error logs, matching this boilerplate's existing `PostHog` and `Axiom` instrumentation.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (clears `.next` cache first) |
| `npm run build` | Production build |
| `npm test` | Run the repository's smoke regression suite |
| `npm run ci:smoke` | Local CI smoke guardrails (checkout/webhook/header assertions) |
| `npm run start` | Start production server |
| `npm run lint` | ESLint check (includes boundary enforcement) |
| `npm run type-check` | TypeScript validation |
| `npm run prettier` | Format code |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:push` | Push schema to database (dev) |
| `npm run prisma:migrate` | Run migrations (production) |

---

## Security

See [SECURITY.md](SECURITY.md) for full security policy.

For ordinary questions and bugs, see [SUPPORT.md](SUPPORT.md). Do not post secrets or vulnerability details in public issues.

**Key protections built in:**
- CSRF protection via SameSite cookies
- HTTPS-only cookies in production
- Rate limiting on sensitive endpoints
- Webhook signature verification
- Disposable email blocking
- Card fingerprint fraud detection

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

Built with care by [alexmorris10x](https://github.com/alexmorris10x)
