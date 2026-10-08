import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/shared/auth/authOptions";
import prisma from "@/shared/utils/database.utils";
import { withMiddleware } from "@/app/api/_middleware";

export const POST = withMiddleware(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { onboardingCompleted: true },
  });

  return NextResponse.json({ success: true });
});
