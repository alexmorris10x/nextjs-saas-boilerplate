import { waitlistConfig } from "@/shared/config/waitlist";
import { sendEmail } from "@/shared/utils/postmark.utils";
import { createWaitlistHandler } from "@/shared/utils/waitlist.mjs";
import { waitlistRepository } from "@/shared/utils/waitlist.server";

export const runtime = "nodejs";

export const POST = createWaitlistHandler({
  enabled: () => waitlistConfig.enabled,
  repository: waitlistRepository,
  sendEmail,
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Your App",
  onError: () => console.error("[waitlist] Signup or confirmation failed"),
});
