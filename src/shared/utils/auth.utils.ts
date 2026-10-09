import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import prisma from "@/shared/utils/database.utils";
import { User } from "@prisma/client";
import authOptions from "@/shared/auth/authOptions";
import { canAccessApp } from "./access.server";

export async function withProtectedRoute(): Promise<User> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },

  });

  if (!user) {
    redirect("/");
  }

  if (!canAccessApp(user)) {
    redirect("/stripe/subscription-expired");
  }

  return user;
}
