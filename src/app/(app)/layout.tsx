import React from "react";
import { getServerSession } from "next-auth";
import AppShell from "@/app/AppShell";
import authOptions from "@/shared/auth/authOptions";
import prisma from "@/shared/utils/database.utils";
import FeedbackAccessBanner from "@/features/feedback/FeedbackAccessBanner";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const user = session?.user?.id ? await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { compUntil: true, accessSource: true },
  }) : null;
  return <AppShell initialSession={session}><FeedbackAccessBanner user={user} />{children}</AppShell>;
}
