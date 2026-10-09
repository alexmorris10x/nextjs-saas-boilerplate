import { cookies } from "next/headers";
import GooglePassSignIn from "@/features/feedback/GooglePassSignIn";
import { FEEDBACK_PASS_COOKIE, INACTIVE_PASS_MESSAGE, normalizePassCode } from "@/shared/utils/feedback-pass.mjs";

export const dynamic = "force-dynamic";

export default async function PassSignInPage() {
  const code = normalizePassCode((await cookies()).get(FEEDBACK_PASS_COOKIE)?.value);
  if (!code) return <main className="p-8"><p>{INACTIVE_PASS_MESSAGE}</p></main>;
  return <GooglePassSignIn />;
}
