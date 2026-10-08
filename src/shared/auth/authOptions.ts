// src/shared/auth/authOptions.ts
import "server-only";

import { AuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "@/shared/utils/database.utils";
import { getStripe } from "@/shared/utils/stripe.utils";
import Stripe from "stripe";

/**
 * Custom adapter that wraps PrismaAdapter to handle orphaned users
 * The standard PrismaAdapter creates User and Account in separate calls,
 * which can leave orphaned users if Account creation fails.
 * This wrapper cleans up orphaned users before allowing new sign-ups.
 */
function createSafeAdapter(): Adapter {
  const baseAdapter = PrismaAdapter(prisma);

  return {
    ...baseAdapter,
    // Override linkAccount to clean up orphaned users before linking
    async linkAccount(account: Parameters<NonNullable<typeof baseAdapter.linkAccount>>[0]) {
      // First, check if user exists but has no accounts (orphaned)
      const existingUser = await prisma.user.findUnique({
        where: { id: account.userId },
        include: { accounts: true },
      });

      // If user exists with no accounts, they're orphaned from a previous failed attempt
      // The base adapter will handle creating the account link
      if (process.env.NODE_ENV === "development" && existingUser && existingUser.accounts.length === 0) {
        console.log(
          `[Auth] User ${account.userId} has no linked accounts, proceeding with account link`
        );
      }

      // Call the original linkAccount
      const result = await baseAdapter.linkAccount!(account);
      return result;
    },

    // Override getUserByEmail to detect and clean orphaned users
    async getUserByEmail(email) {
      const user = await baseAdapter.getUserByEmail!(email);

      // Email magic-link users never have Account rows but do have emailVerified;
      // only an unverified user without accounts is a failed OAuth sign-up
      if (user && !user.emailVerified) {
        // Check if this user has any linked accounts
        const accountCount = await prisma.account.count({
          where: { userId: user.id },
        });

        // If user exists but has no accounts, delete the orphaned user
        // This allows a fresh User + Account to be created
        if (accountCount === 0) {
          console.warn(
            `[Auth] Detected orphaned user ${user.id} (${email}) with no linked accounts - deleting to allow fresh registration`
          );
          await prisma.user.delete({
            where: { id: user.id },
          });
          // Return null so adapter creates a new user
          return null;
        }
      }

      return user;
    },
  };
}

/**
 * Next‑Auth configuration
 * – Google provider only (email login removed)
 * – Creates a Stripe Customer on user creation
 * – Embeds `subscriptionStatus`, `uuid`, `email` in the JWT so the client
 *   can react without extra DB queries
 */

const authOptions: AuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",

  // ──────────────────────────────────── Providers ──────────────────────────────
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],

  // ──────────────────────────────────── Adapter ────────────────────────────────
  adapter: createSafeAdapter(),

  // ──────────────────────────────────── Events ─────────────────────────────────
  events: {
    async createUser({ user }) {
      const isDev = process.env.NODE_ENV === "development";
      if (isDev) console.log("[Auth] createUser event started for:", user.email);

      const stripe = getStripe();
      const email = user.email ?? undefined;
      const displayName = user.name || email?.split("@")[0] || "";

      let customer = null;
      if (email) {
        const existing = await stripe.customers.list({
          email,
          limit: 1,
        });
        const activeCustomer = existing.data.find(
          (entry): entry is Stripe.Customer =>
            !("deleted" in entry)
        );
        customer = activeCustomer ?? null;
      }

      if (!customer) {
        customer = await stripe.customers.create({
          email,
          name: displayName,
          metadata: { internalUserId: user.id },
        });
        if (isDev) console.log("[Auth] Stripe customer created:", customer.id);
      } else if (!customer.metadata?.internalUserId) {
        await stripe.customers.update(customer.id, {
          metadata: {
            ...customer.metadata,
            internalUserId: customer.metadata?.internalUserId ?? user.id,
          },
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          customerId: customer.id,
          subscriptionStatus: "new",
          onboardingCompleted: false,
          name: displayName,
          image: user.image || null,
          subscriptionId: null,
          priceId: null,
        },
      });

      if (isDev) console.log("[Auth] createUser event complete");
    },
  },

  // ─────────────────────────────────── Callbacks ───────────────────────────────
  callbacks: {
    /**
     * JWT callback
     * – Enriches token with DB info on sign-in or explicit update
     * – Stores ALL session data in the token to avoid DB queries in session callback
     * – Use `trigger: "update"` to force refresh (e.g., after subscription change)
     */
    async jwt({ token, user, trigger }) {
      const isSignIn = !!user;
      const isUpdate = trigger === "update";
      // Only fetch from DB when we need fresh data
      const needsDbFetch = token.sub && (!token.subscriptionStatus || isSignIn || isUpdate);

      if (user) {
        token.sub = user.id;
        token.id = user.id;
        if (user.email) token.email = user.email;
        if (user.name) token.name = user.name;
        if (user.image) token.picture = user.image;
      }

      // Fetch all session data from DB only on sign-in or explicit update
      if (token.sub && needsDbFetch) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: {
            uuid: true,
            subscriptionStatus: true,
            email: true,
            hasLifetimeAccess: true,
            onboardingCompleted: true,
            name: true,
            image: true,
            createdAt: true,
          },
        });

        if (dbUser) {
          token.uuid = dbUser.uuid;
          token.subscriptionStatus = dbUser.subscriptionStatus;
          token.hasLifetimeAccess = dbUser.hasLifetimeAccess;
          token.onboardingCompleted = dbUser.onboardingCompleted;
          token.createdAt = dbUser.createdAt?.toISOString() ?? null;
          if (dbUser.email) token.email = dbUser.email;
          if (dbUser.name) token.name = dbUser.name;
          if (dbUser.image) token.picture = dbUser.image;
        }
      }

      return token;
    },

    /**
     * Session callback
     * – NEVER queries the database - uses only token data for performance
     * – All data should be stored in JWT via the jwt callback above
     */
    session({ session, token }) {
      const userId = token.sub || (token.id as string);
      if (!userId) throw new Error("No user ID in token");

      const subscriptionStatus = (token.subscriptionStatus as string) ?? "new";
      const hasLifetimeAccess = (token.hasLifetimeAccess as boolean) ?? false;

      session.user = {
        id: userId,
        name: (token.name as string) ?? null,
        image: (token.picture as string) ?? null,
        email: (token.email as string) ?? null,
        uuid: (token.uuid as string) ?? null,
        subscriptionStatus,
        hasLifetimeAccess,
        onboardingCompleted: (token.onboardingCompleted as boolean) ?? false,
        plan: hasLifetimeAccess || subscriptionStatus === "active" ? "paid" : "free",
        createdAt: (token.createdAt as string) ?? null,
      };

      return session;
    },
  },

  // ─────────────────────────────────── Session ────────────────────────────────
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 5 * 60, // refresh JWT every 5 minutes
  },

  // ─────────────────────────────────── Cookies ────────────────────────────────
  cookies: {
    state: {
      name: "next-auth.state",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    pkceCodeVerifier: {
      name: "next-auth.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
};

export default authOptions;
