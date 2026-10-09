import { hasCompAccess } from "@/shared/utils/paid-access.mjs";
import { normalizePassCode } from "@/shared/utils/feedback-pass.mjs";

type BannerUser = {
  compUntil: Date | null;
  feedbackPassCode: string | null;
  accessSource?: string | null;
};

export default function FeedbackAccessBanner({ user }: { user: BannerUser | null }) {
  if (!user?.compUntil || !normalizePassCode(user.feedbackPassCode) || !hasCompAccess(user)) return null;
  const date = user.compUntil.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  return <div role="status" className="bg-primary/10 px-4 py-3 text-center text-sm">You have free access until {date}. Thanks for helping.</div>;
}
