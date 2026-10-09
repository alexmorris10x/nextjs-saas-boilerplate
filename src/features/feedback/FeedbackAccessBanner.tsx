import { hasCompAccess } from "@/shared/utils/paid-access.mjs";

export default function FeedbackAccessBanner({ user }: { user: { compUntil: Date | null; accessSource: string | null } | null }) {
  if (!user?.compUntil || user.accessSource !== "feedback" || !hasCompAccess(user)) return null;
  const date = user.compUntil.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  return <div role="status" className="bg-primary/10 px-4 py-3 text-center text-sm">You have free access until {date}. Thanks for helping.</div>;
}
