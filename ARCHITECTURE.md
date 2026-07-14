# Architecture Guide

This document provides an in-depth explanation of the architectural decisions in this Next.js SaaS boilerplate. Understanding the "why" behind each choice will help you make informed decisions when building on top of this foundation.

## Table of Contents

1. [Architectural Philosophy](#architectural-philosophy)
2. [Folder Structure](#folder-structure)
3. [Authentication Architecture](#authentication-architecture)
4. [Payment System Design](#payment-system-design)
5. [API Layer](#api-layer)
6. [Database Design](#database-design)
7. [State Management](#state-management)
8. [Routing & Middleware](#routing--middleware)
9. [UI Architecture](#ui-architecture)
10. [Performance Patterns](#performance-patterns)
11. [Security Measures](#security-measures)
12. [Decision Records](#decision-records)

---

## Architectural Philosophy

### Core Principles

1. **Serverless-first** — Every pattern works on Vercel, Netlify, or AWS Lambda
2. **Type safety end-to-end** — TypeScript + Zod from API to UI
3. **Fail gracefully** — Missing services don't crash the app
4. **Secure by default** — Authentication, rate limiting, and validation built in
5. **Scale from day one** — No architectural rewrites as you grow

### Why These Principles Matter

**Serverless-first:** Traditional patterns (connection pooling, in-memory sessions) break on serverless. Every choice in this boilerplate works without persistent servers.

**Type safety:** Runtime errors are expensive. Catch them at compile time with TypeScript, catch bad data at the API boundary with Zod.

**Fail gracefully:** Redis down? Allow requests instead of crashing. Analytics failing? Log and continue. This keeps your app running during partial outages.

**Secure by default:** Security bolted on later is security forgotten. Rate limiting, CSRF protection, and webhook validation are built in from the start.

**Scale from day one:** The architecture handles 100 users and 100,000 users without restructuring. Database patterns, caching, and API design scale naturally.

---

## Folder Structure

### Layer Architecture

```
src/
├── app/        # Presentation layer (routes, pages, API endpoints)
├── features/   # Feature modules (business logic grouped by domain)
├── core/       # Core UI components (buttons, modals, inputs)
├── shared/     # Shared utilities (auth, hooks, utils, types)
└── lib/        # Third-party integrations (analytics, services)
```

### Why This Structure?

| Alternative | Pros | Cons | Verdict |
|-------------|------|------|---------|
| **Layer-based** (`components/`, `hooks/`, `utils/`) | Familiar | Files scattered, hard to find related code | Not scalable |
| **Feature-based** (our choice) | Related code together, clear boundaries | More folders initially | ✅ Best for SaaS |
| **Domain-driven** | Maximum separation | Overkill for most projects | Too complex |

Feature-based organization means everything for "billing" is in `features/billing/`. When you're working on a feature, you rarely jump between distant folders.

### Boundary Enforcement

ESLint rules prevent architectural violations:

```javascript
// .eslintrc.json
{
  "rules": {
    "boundaries/element-types": [
      "error",
      {
        "default": "disallow",
        "rules": [
          // core can only import from shared and core
          { "from": "core", "allow": ["shared", "core"] },
          // features can import from anywhere except lib
          { "from": "feature", "allow": ["shared", "core", "feature"] },
          // app can import from anything
          { "from": "app", "allow": ["shared", "core", "feature", "lib", "app"] }
        ]
      }
    ]
  }
}
```

**Why enforce this?** Without guardrails, codebases become spaghetti. A "quick fix" imports from the wrong layer, then another, and soon everything depends on everything.

### Route Groups Explained

```
app/
├── (app)/              # Route group for authenticated pages
│   ├── layout.tsx      # App shell with navigation
│   ├── dashboard/
│   └── settings/
├── (marketing)/        # Route group for public pages
│   ├── layout.tsx      # Marketing layout with header/footer
│   ├── page.tsx        # Landing page at /
│   └── pricing/
└── api/                # API routes (no grouping needed)
```

**Key insight:** Parentheses create logical groups without affecting URLs.

- `(marketing)/pricing/page.tsx` → `/pricing`
- `(app)/dashboard/page.tsx` → `/dashboard`

Each group has its own `layout.tsx`, so marketing pages get the marketing header, app pages get the app navigation, without any conditional logic.

---

## Authentication Architecture

### Why NextAuth.js?

| Alternative | Pros | Cons | Verdict |
|-------------|------|------|---------|
| **NextAuth.js** | Battle-tested, OAuth support, Prisma adapter | Learning curve | ✅ Best for Next.js |
| **Clerk** | Managed, beautiful UI | Expensive at scale, vendor lock-in | Good for MVPs |
| **Auth0** | Enterprise features | Complex, expensive | Overkill |
| **Custom JWT** | Full control | Security risks, reinventing wheel | Don't |

NextAuth.js handles OAuth complexity, session management, and security best practices. You focus on your product.

### JWT vs Database Sessions

We use **JWT sessions**. Here's why:

```
Database Sessions:
Request → Read session table → Verify → Response
         ↑
         Database query on EVERY request

JWT Sessions:
Request → Verify signature (CPU only) → Response
         ↑
         No database involved
```

**Trade-offs:**

| Aspect | Database Sessions | JWT Sessions |
|--------|-------------------|--------------|
| Every request | DB query | Signature verification |
| Serverless | Connection pool issues | Perfect fit |
| Immediate logout | Yes | Within refresh window |
| Session storage | Database table | Client cookie |

For SaaS, JWT's trade-offs are acceptable. We use a 5-minute refresh window — users are "logged out" within 5 minutes of status changes.

### Token Enrichment Pattern

```typescript
// authOptions.ts
callbacks: {
  async jwt({ token, user, trigger }) {
    // Only fetch DB on sign-in or explicit update trigger
    if (trigger === "signIn" || trigger === "update") {
      const dbUser = await prisma.user.findUnique({
        where: { id: token.sub },
        select: {
          subscriptionStatus: true,
          hasLifetimeAccess: true,
          customerId: true,
        }
      });

      // Embed in token (no DB queries later)
      token.subscriptionStatus = dbUser?.subscriptionStatus;
      token.hasLifetimeAccess = dbUser?.hasLifetimeAccess;
    }
    return token;
  },

  async session({ session, token }) {
    // Session just reads from token
    session.user.subscriptionStatus = token.subscriptionStatus;
    session.user.hasLifetimeAccess = token.hasLifetimeAccess;
    return session;
  }
}
```

**Why this pattern?**

Without it, every `getSession()` or `useSession()` call could trigger a database query. With it, session data lives in the JWT cookie. Zero database overhead for session checks.

**When to refresh:**
- On sign-in (user just authenticated)
- On `trigger: "update"` (called after subscription changes)
- Client polls every 15 minutes for subscription changes

### Custom Adapter Wrapper

```typescript
// safePrismaAdapter.ts
export function SafePrismaAdapter(prisma: PrismaClient): Adapter {
  const adapter = PrismaAdapter(prisma);

  return {
    ...adapter,
    createUser: async (user) => {
      // Clean up orphaned users before creating new one
      await prisma.user.deleteMany({
        where: {
          email: user.email,
          accounts: { none: {} }, // No linked accounts = orphaned
        }
      });
      return adapter.createUser!(user);
    }
  };
}
```

**Why wrap the adapter?**

OAuth flows can fail mid-way, leaving a `User` record with no `Account` linked. Next sign-in attempt fails with unique constraint error. This wrapper cleans up orphans before they cause problems.

---

## Payment System Design

### Stripe Integration Architecture

```
┌──────────────────┐         ┌──────────────────┐
│   Your App       │         │   Stripe         │
│                  │         │                  │
│  ┌────────────┐  │ create  │  ┌────────────┐  │
│  │ Checkout   │──┼────────▶│  │ Checkout   │  │
│  │ Button     │  │         │  │ Session    │  │
│  └────────────┘  │         │  └────────────┘  │
│                  │         │        │         │
│  ┌────────────┐  │ webhook │        │ paid    │
│  │ Webhook    │◀─┼─────────┼────────┘         │
│  │ Handler    │  │         │                  │
│  └────────────┘  │         │                  │
│        │         │         │                  │
│        ▼         │         │                  │
│  ┌────────────┐  │         │                  │
│  │ Database   │  │         │                  │
│  └────────────┘  │         │                  │
└──────────────────┘         └──────────────────┘
```

**Key insight:** Never trust the client. Subscription status is updated via webhooks, not checkout completion redirects.

### Webhook Idempotency

Stripe guarantees at-least-once delivery. Your webhook might be called multiple times for the same event.

```typescript
// webhook/stripe/route.ts
export async function POST(request: Request) {
  const event = stripe.webhooks.constructEvent(body, signature, secret);

  // Check if already processed
  const existing = await prisma.subscriptionEvent.findUnique({
    where: { stripeEventId: event.id }
  });

  if (existing) {
    // Already handled, skip
    return NextResponse.json({ received: true });
  }

  // Process the event
  await handleEvent(event);

  // Record as processed (for idempotency)
  await prisma.subscriptionEvent.create({
    data: {
      stripeEventId: event.id,
      type: event.type,
      payload: event.data.object,
    }
  });

  return NextResponse.json({ received: true });
}
```

**Why is this critical?**

Without idempotency:
- User charged twice (duplicate `invoice.paid` events)
- Subscription status flip-flops (out-of-order events)
- Analytics inflated (duplicate events tracked)

With idempotency:
- Each event processed exactly once
- Audit trail for debugging
- Safe webhook retries

### Fraud Prevention

**Disposable Email Blocking**

```typescript
const disposablePatterns = [
  'mailinator.com', 'tempmail.com', '10minutemail.com',
  'guerrillamail.com', 'throwaway.email'
];

function isDisposableEmail(email: string): boolean {
  return disposablePatterns.some(pattern =>
    email.toLowerCase().includes(pattern)
  );
}

// In checkout handler
if (isDisposableEmail(userEmail)) {
  return NextResponse.json(
    { error: 'Please use a valid email address' },
    { status: 400 }
  );
}
```

**Why block these?** Free trial abuse. Competitors create 100 accounts to use your product without paying. Disposable emails are a red flag.

**Card Fingerprint Duplicate Detection**

```typescript
// On checkout completion, check for duplicate trials
const existingTrial = await prisma.user.findFirst({
  where: {
    cardFingerprint: paymentMethod.card.fingerprint,
    trialUsed: true,
    id: { not: userId } // Not the current user
  }
});

if (existingTrial) {
  // Same card already used trial → charge immediately
  await stripe.subscriptions.update(subscription.id, {
    trial_end: 'now' // Skip trial
  });
}
```

**Why fingerprints?** Users create multiple accounts with same card to get multiple trials. Stripe's card fingerprint identifies the same physical card across accounts.

### Dual-Write Consistency

```typescript
// Update both User (for fast middleware) and Subscription (for full data)
await prisma.$transaction([
  prisma.user.update({
    where: { id: userId },
    data: { subscriptionStatus: status }
  }),
  prisma.subscription.upsert({
    where: { userId },
    create: { userId, stripeSubId, status, ... },
    update: { status, currentPeriodEnd, ... }
  })
]);
```

**Why duplicate data?**

- `User.subscriptionStatus` — Fast lookup in middleware (every request)
- `Subscription` table — Full subscription details (billing history, period dates)

The user table is denormalized for performance. Middleware checks `User.subscriptionStatus` without joins.

---

## API Layer

### Composable Middleware

```typescript
// api/_middleware/index.ts
export function withMiddleware(
  handler: Handler,
  options: {
    validation?: { schema: ZodSchema },
    rateLimit?: { type: 'standard' | 'strict' },
    cache?: { ttl: number },
    monitoring?: boolean
  }
) {
  return async (request: Request, context: any) => {
    let wrappedHandler = handler;

    // Apply middleware inside-out (last added runs first)
    if (options.validation) {
      wrappedHandler = withValidation(wrappedHandler, options.validation);
    }
    if (options.cache) {
      wrappedHandler = withCache(wrappedHandler, options.cache);
    }
    if (options.rateLimit) {
      wrappedHandler = withRateLimit(wrappedHandler, options.rateLimit);
    }
    if (options.monitoring !== false) {
      wrappedHandler = withMonitoring(wrappedHandler);
    }

    return wrappedHandler(request, context);
  };
}
```

**Usage:**

```typescript
// api/items/route.ts
export const POST = withMiddleware(
  async (request, { validated }) => {
    // validated is typed from schema
    const item = await createItem(validated);
    return NextResponse.json(item);
  },
  {
    validation: { schema: createItemSchema },
    rateLimit: { type: 'standard' },
  }
);
```

**Why compose middleware?**

Without composition, every route has:
```typescript
// Repeated in EVERY route
const body = await request.json();
const result = schema.safeParse(body);
if (!result.success) return error(400);
const { success } = await ratelimit.limit(ip);
if (!success) return error(429);
// ... finally, business logic
```

With composition:
```typescript
// Just business logic
export const POST = withMiddleware(handler, { validation, rateLimit });
```

### Rate Limiting

```typescript
// api/_middleware/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const configs = {
  standard: { requests: 1000, window: '1m' },
  strict: { requests: 100, window: '1m' },
  auth: { requests: 10, window: '1m' },
};

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(config.requests, config.window),
});

export function withRateLimit(handler: Handler, { type }: { type: keyof typeof configs }) {
  return async (request: Request, context: any) => {
    const ip = request.headers.get('x-forwarded-for') ?? 'anonymous';
    const { success, remaining, reset } = await ratelimit.limit(`${type}:${ip}`);

    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString()
          }
        }
      );
    }

    return handler(request, context);
  };
}
```

**Why Upstash Redis?**

| Alternative | Pros | Cons | Verdict |
|-------------|------|------|---------|
| In-memory | Simple | Doesn't work on serverless (no shared state) | No |
| Database | Persistent | Too slow for every request | No |
| Upstash Redis | Serverless, fast, distributed | External service | ✅ Best fit |

Upstash is designed for serverless: HTTP-based, no connection pooling, per-request billing.

**Graceful degradation:**

```typescript
const ratelimit = process.env.UPSTASH_REDIS_REST_URL
  ? new Ratelimit({ ... })
  : null;

export function withRateLimit(handler: Handler, options: Options) {
  if (!ratelimit) {
    // Redis not configured → allow all requests
    console.warn('Rate limiting disabled: UPSTASH_REDIS_REST_URL not set');
    return handler;
  }
  // ... normal rate limiting
}
```

Don't crash if Redis is missing. Log a warning and allow requests.

### Validation with Zod

```typescript
// api/_validation/items.ts
import { z } from 'zod';

export const createItemSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
```

```typescript
// api/_middleware/validation.ts
export function withValidation(handler: Handler, { schema }: { schema: ZodSchema }) {
  return async (request: Request, context: any) => {
    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: result.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    // Pass validated data to handler
    return handler(request, { ...context, validated: result.data });
  };
}
```

**Why Zod?**

- **Runtime validation** — Catch bad data at API boundary
- **Type inference** — `z.infer<typeof schema>` generates TypeScript types
- **Detailed errors** — Field-level error messages for UI display
- **Composable** — `.extend()`, `.merge()`, `.pick()` for schema reuse

---

## Database Design

### Prisma with Neon Serverless

**Traditional PostgreSQL on serverless:**

```
Cold Start #1: Open connection → Pool exhausted after 100 cold starts
Cold Start #2: Open connection → Same pool
...
Cold Start #100: Open connection → ERROR: too many connections
```

**Neon HTTP driver:**

```
Request #1: HTTP query → Response → Connection closed
Request #2: HTTP query → Response → Connection closed
...
Request #1000: HTTP query → Response → No connection pool!
```

```typescript
// shared/utils/database.utils.ts
import { neon } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';

const sql = neon(process.env.DATABASE_URL!);
const adapter = new PrismaNeon(sql);

// Singleton for dev (hot reload) and production
const globalForPrisma = global as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

### Schema Design Patterns

**Denormalized Status Fields**

```prisma
model User {
  id                  String   @id @default(cuid())
  email               String   @unique

  // Denormalized from Subscription (for fast middleware checks)
  subscriptionStatus  SubscriptionStatus @default(new)
  hasLifetimeAccess   Boolean @default(false)

  // Stripe customer ID
  customerId          String?  @unique

  // Full subscription details in separate table
  subscription        Subscription?
}

model Subscription {
  id                String   @id @default(cuid())
  userId            String   @unique
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  stripeSubId       String   @unique
  status            SubscriptionStatus
  currentPeriodEnd  DateTime?
  trialEnd          DateTime?

  // Audit trail
  events            SubscriptionEvent[]
}
```

**Why denormalize?**

Middleware runs on every request:
```typescript
// middleware.ts
const token = await getToken({ req });
if (token.subscriptionStatus !== 'active') {
  return redirect('/upgrade');
}
```

If status lived only in `Subscription` table, middleware would need a join on every request. Denormalized on `User`, it's a single indexed read.

**Audit Trail**

```prisma
model SubscriptionEvent {
  id              String   @id @default(cuid())
  stripeEventId   String   @unique  // Idempotency key
  subscriptionId  String?
  subscription    Subscription? @relation(...)

  type            String   // e.g., "customer.subscription.updated"
  payload         Json     // Full Stripe event data
  processedAt     DateTime @default(now())
}
```

**Why store raw events?**

- **Idempotency** — Skip duplicate webhooks
- **Debugging** — See exactly what Stripe sent
- **Auditing** — Compliance, dispute resolution
- **Replay** — Reprocess events if handler had bugs

### Indexes

```prisma
model User {
  customerId String? @unique
  @@index([subscriptionStatus])  // For status-based queries
}

model Subscription {
  stripeSubId String @unique
  @@index([userId])
}

model SubscriptionEvent {
  stripeEventId String @unique  // Critical for idempotency
  @@index([subscriptionId])
}
```

**Why these indexes?**

- `customerId` — Webhook handler looks up user by Stripe customer
- `subscriptionStatus` — Dashboard queries for active users
- `stripeEventId` — Idempotency check (unique constraint = implicit index)

---

## State Management

### Two Types of State

| Type | Characteristics | Tool | Example |
|------|-----------------|------|---------|
| **Local state** | UI-only, ephemeral | Zustand | Modal open, toast queue |
| **Server state** | Comes from API, needs sync | React Query | User data, subscription |

**Why separate them?**

They have different requirements:
- Local state: Immediate updates, no persistence needed
- Server state: Caching, background refresh, invalidation

### Zustand for Local State

```typescript
// shared/store/toast.store.ts
import { create } from 'zustand';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => set((state) => ({
    toasts: [...state.toasts, { ...toast, id: crypto.randomUUID() }].slice(-3)
  })),
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter(t => t.id !== id)
  })),
}));
```

**Why Zustand over Redux/Context?**

| Feature | Redux | Context | Zustand |
|---------|-------|---------|---------|
| Boilerplate | High (actions, reducers) | Medium | Minimal |
| Provider needed | Yes | Yes | No |
| DevTools | Yes | No | Yes |
| Bundle size | ~2KB | 0 | ~1KB |

Zustand is simpler: define state and functions, use anywhere. No `<Provider>` wrapper needed.

### React Query for Server State

```typescript
// app/providers.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import localforage from 'localforage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      retry: 1,
    },
    mutations: {
      retry: 2,
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: localforage,
  key: 'QUERY_CACHE',
});

export function Providers({ children }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
```

**Why persist to IndexedDB?**

- Page reload → Instant data (from cache) → Background refresh
- Offline support → Show cached data when network unavailable
- Faster perceived performance → No loading spinner on navigation

**Session-based cache isolation:**

```typescript
// SessionKeyBridge component
const { data: session } = useSession();
const queryClient = useQueryClient();

useEffect(() => {
  if (!session?.user?.id) {
    // User logged out → clear cache
    queryClient.clear();
  }
}, [session?.user?.id]);
```

**Why clear cache on logout?** Prevent data leaking between users if someone signs out and another signs in on the same browser.

---

## Routing & Middleware

### Edge Middleware

```typescript
// middleware.ts
import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

const publicRoutes = ['/', '/pricing', '/blog', '/login', '/signup'];
const allowedPrefixes = ['/_next', '/api/auth', '/api/public', '/api/webhook'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static assets and auth routes
  if (allowedPrefixes.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Allow public routes
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Check authentication
  const token = await getToken({ req: request });

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Check subscription status
  const status = token.subscriptionStatus as string;
  const hasLifetime = token.hasLifetimeAccess as boolean;

  if (!hasLifetime && ['expired', 'canceled', 'past_due'].includes(status)) {
    return NextResponse.redirect(new URL('/upgrade', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

**Why Edge Middleware?**

- Runs before every request (at the edge, close to users)
- No cold start — always warm
- Can redirect unauthenticated users before page renders
- Subscription checks happen server-side (can't be bypassed)

**Allowlist vs Blocklist:**

We use an **allowlist** for public routes:
```typescript
const publicRoutes = ['/', '/pricing', '/blog'];
if (publicRoutes.includes(pathname)) return next();
```

Not a blocklist:
```typescript
// DON'T do this
const protectedRoutes = ['/dashboard', '/settings'];
if (protectedRoutes.includes(pathname)) checkAuth();
```

**Why?** Forgetting to add a route to a blocklist = security hole. Forgetting to add to allowlist = overly restrictive (safer default).

### Server Actions

```typescript
// app/actions/user.actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
});

export async function updateProfile(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: 'Unauthorized' };
  }

  const input = {
    name: formData.get('name'),
    bio: formData.get('bio'),
  };

  const result = updateProfileSchema.safeParse(input);
  if (!result.success) {
    return { error: 'Invalid input', details: result.error.flatten() };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: result.data,
  });

  revalidatePath('/settings');
  return { success: true };
}
```

**Why Server Actions over API routes for mutations?**

| Aspect | API Routes | Server Actions |
|--------|------------|----------------|
| Type safety | Manual types | Automatic inference |
| CSRF protection | Manual | Built-in |
| Progressive enhancement | No | Works without JS |
| Revalidation | Manual `fetch` | `revalidatePath()` |

Server Actions are the modern way to handle mutations in Next.js. Use them for form submissions and data changes.

---

## UI Architecture

### Component Hierarchy

```
core/components/      # Primitive, reusable
├── Button/          # ButtonCTA, ButtonSignin, etc.
├── Modal/
└── Input/

features/            # Feature-specific
├── billing/
│   ├── UpgradePrompt.tsx
│   └── PricingCard.tsx
└── layout/
    ├── Header.tsx
    └── Sidebar.tsx

app/                 # Page-level
├── (app)/
│   └── dashboard/
│       └── DashboardPage.tsx
```

**Rule:** Components move UP the hierarchy as they become more reusable.

- Start in `app/` (page-specific)
- Extract to `features/` (used across pages in that feature)
- Promote to `core/` (used across features)

### TailwindCSS + DaisyUI

**Why TailwindCSS?**

| Alternative | Pros | Cons | Verdict |
|-------------|------|------|---------|
| CSS Modules | Scoped by default | Verbose, context switching | Old school |
| Styled Components | Component-based | Runtime cost, SSR complexity | Not for App Router |
| TailwindCSS | Utility-first, no runtime | Learning curve, long class lists | ✅ Best for Next.js |

**Why DaisyUI on top?**

TailwindCSS is low-level:
```html
<button class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded">
  Click me
</button>
```

DaisyUI provides semantic components:
```html
<button class="btn btn-primary">Click me</button>
```

Best of both worlds: Tailwind's utility system + pre-built accessible components.

### Theme System

```typescript
// app/layout.tsx
<html data-theme="light">
  <head>
    <script dangerouslySetInnerHTML={{
      __html: `
        (function() {
          const theme = localStorage.getItem('theme') || 'light';
          document.documentElement.setAttribute('data-theme', theme);
        })();
      `
    }} />
  </head>
  <body>{children}</body>
</html>
```

**Why inline script?**

Prevents **FOUC** (Flash of Unstyled Content):
1. HTML loads with `data-theme="light"` (default)
2. React hydrates
3. `useEffect` runs → changes theme
4. User sees flash from light → dark

With inline script:
1. HTML loads
2. Script runs immediately (blocking) → sets correct theme
3. React hydrates with correct theme already applied

---

## Performance Patterns

### Dynamic Imports

```typescript
// Only load Stripe when needed
const StripeCheckout = dynamic(
  () => import('@/features/billing/StripeCheckout'),
  { loading: () => <Skeleton className="h-10 w-full" /> }
);

// Only load on billing page
export default function BillingPage() {
  return <StripeCheckout />;
}
```

**Why?**

Stripe's JS is ~100KB. Without dynamic import:
- Every page loads Stripe
- Initial bundle bloated
- Slower time-to-interactive

With dynamic import:
- Stripe only loads on billing page
- Main bundle stays small
- Faster for 90% of page visits

### Third-Party Script Loading

```typescript
// Defer non-critical scripts
<Script
  src="https://js.stripe.com/v3/"
  strategy="lazyOnload"  // Load after page is interactive
/>

<Script
  src="https://client.crisp.chat/l.js"
  strategy="afterInteractive"  // Load after hydration
/>
```

**Strategy guide:**

| Strategy | When | Use for |
|----------|------|---------|
| `beforeInteractive` | During SSR | Polyfills, critical scripts |
| `afterInteractive` | After hydration | Analytics, chat widgets |
| `lazyOnload` | After page load | Anything not immediately needed |

### Image Optimization

```typescript
import Image from 'next/image';

<Image
  src="/hero.png"
  alt="Hero image"
  width={1200}
  height={600}
  priority  // Preload for LCP
  placeholder="blur"
  blurDataURL={blurHash}
/>
```

Next.js Image component provides:
- Automatic WebP/AVIF conversion
- Responsive srcset generation
- Lazy loading by default
- Layout shift prevention

---

## Security Measures

### CSRF Protection

Built into Server Actions. For API routes:

```typescript
// Cookies are SameSite=Lax by default
// NextAuth.js handles CSRF for auth routes
// For custom APIs, verify origin header:

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const allowedOrigins = [process.env.NEXT_PUBLIC_APP_URL];

  if (!allowedOrigins.includes(origin)) {
    return new Response('CSRF error', { status: 403 });
  }
  // ... handle request
}
```

### Rate Limiting

See [API Layer > Rate Limiting](#rate-limiting).

### Webhook Verification

```typescript
// api/webhook/stripe/route.ts
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed');
    return new Response('Invalid signature', { status: 400 });
  }

  // Signature valid, process event
}
```

**Why verify signatures?**

Without verification, anyone can POST fake events to your webhook:
```bash
curl -X POST https://yourapp.com/api/webhook/stripe \
  -d '{"type":"customer.subscription.updated","data":{"object":{"status":"active"}}}'
```

With verification, only Stripe (who knows the secret) can create valid signatures.

### Security Headers

```typescript
// next.config.ts
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

module.exports = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
```

---

## Decision Records

### Why Next.js App Router?

**Decided:** Use App Router (not Pages Router)

**Context:** Pages Router is stable but older. App Router is the future.

**Reasoning:**
- Server Components reduce client bundle
- Streaming and Suspense for better UX
- Server Actions simplify mutations
- Route groups organize layouts cleanly
- Official recommendation from Next.js team

**Trade-off:** Some libraries don't support App Router yet. This is decreasingly common.

### Why JWT Sessions?

**Decided:** Use JWT strategy (not database sessions)

**Context:** NextAuth.js supports both.

**Reasoning:**
- Serverless: No database query on every request
- Scalable: Stateless, works with any number of instances
- Fast: Verification is CPU-only (no I/O)

**Trade-off:** Can't immediately invalidate sessions. We use 5-minute refresh window.

### Why Neon over Supabase?

**Decided:** Recommend Neon for database

**Context:** Both are serverless PostgreSQL options.

**Reasoning:**
- Neon's HTTP driver works better with Prisma
- Scale-to-zero billing is more aggressive
- Better cold start times
- Simpler (just PostgreSQL, no bundled services)

**Trade-off:** Supabase includes auth, storage, realtime. If you need those, Supabase might be better.

### Why Upstash for Rate Limiting?

**Decided:** Use Upstash Redis for rate limiting

**Context:** Need distributed rate limiting on serverless.

**Reasoning:**
- HTTP-based (no connection pooling)
- Pay-per-request pricing
- Built-in rate limiting SDK
- Works globally (edge-compatible)

**Trade-off:** External dependency. We make it optional with graceful fallback.

### Why PostHog over Sentry for Error Tracking?

**Decided:** Use PostHog error tracking instead of Sentry

**Context:** PostHog error tracking became GA in April 2025 with 100K free exceptions/month. Previously, Sentry was the default choice.

**Reasoning:**
- PostHog error tracking is GA (not beta), battle-tested at scale
- 100K free exceptions/month vs Sentry's 5K on free tier
- Session replay + error tracking = better debugging context than Sentry breadcrumbs
- One fewer vendor — analytics, session replay, feature flags, AND error tracking in one tool
- `@posthog/nextjs-config` auto-uploads source maps during Vercel builds (symbolicated stack traces)
- Vercel function logs cover server-side error visibility

**Setup:**
- `capture_exceptions: true` in PostHog client init (`instrumentation-client.ts`)
- `@posthog/nextjs-config` wrapping `next.config` for source map uploads (conditional — only when `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_ENV_ID` are set)
- Server-side env vars: `POSTHOG_PERSONAL_API_KEY` (personal API key), `POSTHOG_ENV_ID` (project/environment ID)

**Trade-off:** Sentry has deeper backend APM (transaction tracing, performance monitoring). For pre-PMF SaaS, PostHog's error tracking + Vercel logs is sufficient. Add Sentry later only if you need server-side APM.

### Why Zustand over Redux?

**Decided:** Use Zustand for local state

**Context:** Multiple state management options available.

**Reasoning:**
- Minimal boilerplate
- No provider required
- TypeScript-first
- Tiny bundle size (~1KB)
- Sufficient for UI state (modals, toasts)

**Trade-off:** Less ecosystem than Redux. For complex state, Redux might be better.

---

## Further Reading

- [Next.js App Router Documentation](https://nextjs.org/docs/app)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Stripe Billing Documentation](https://stripe.com/docs/billing)
- [TanStack Query Documentation](https://tanstack.com/query)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)

---

*This document is part of the [Next.js SaaS Boilerplate](https://github.com/alexmorris10x/nextjs-saas-boilerplate) project.*
