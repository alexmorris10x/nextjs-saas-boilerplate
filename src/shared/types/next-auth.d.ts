import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: NonNullable<DefaultSession["user"]> & {
      id: string;
      uuid: string | null;
      subscriptionStatus: string;
      hasLifetimeAccess: boolean;
      isInternal: boolean;
      hasPaidAccess: boolean;
      compUntil: string | null;
      accessSource: string | null;
      feedbackPassCode: string | null;
      onboardingCompleted: boolean;
      plan: "paid" | "free";
      createdAt: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    uuid?: string | null;
    subscriptionStatus?: string;
    hasLifetimeAccess?: boolean;
    compUntil?: string | null;
    accessSource?: string | null;
    feedbackPassCode?: string | null;
    onboardingCompleted?: boolean;
    createdAt?: string | null;
  }
}
