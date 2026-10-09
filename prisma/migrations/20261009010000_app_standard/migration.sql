-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accessSource" TEXT,
ADD COLUMN     "compUntil" TIMESTAMP(3),
ADD COLUMN     "feedbackPassCode" TEXT,
ADD COLUMN     "signupRef" TEXT,
ADD COLUMN     "signupUtmCampaign" TEXT,
ADD COLUMN     "signupUtmMedium" TEXT,
ADD COLUMN     "signupUtmSource" TEXT;

-- CreateTable
CREATE TABLE "FeedbackPass" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 3,
    "maxUses" INTEGER NOT NULL DEFAULT 100,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackPassRedemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feedbackPassId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackPassRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistSignup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT,
    "product" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmationSentAt" TIMESTAMP(3),
    "confirmationClaimToken" TEXT,
    "confirmationClaimedAt" TIMESTAMP(3),

    CONSTRAINT "WaitlistSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackPass_code_key" ON "FeedbackPass"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackPassRedemption_userId_feedbackPassId_key" ON "FeedbackPassRedemption"("userId", "feedbackPassId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistSignup_email_key" ON "WaitlistSignup"("email");

-- CreateIndex
CREATE INDEX "WaitlistSignup_createdAt_idx" ON "WaitlistSignup"("createdAt");

-- AddForeignKey
ALTER TABLE "FeedbackPassRedemption" ADD CONSTRAINT "FeedbackPassRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackPassRedemption" ADD CONSTRAINT "FeedbackPassRedemption_feedbackPassId_fkey" FOREIGN KEY ("feedbackPassId") REFERENCES "FeedbackPass"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Keep pass capacity and canonical case invariant even for manual/script writes.
ALTER TABLE "FeedbackPass"
ADD CONSTRAINT "FeedbackPass_code_uppercase" CHECK ("code" = upper("code")),
ADD CONSTRAINT "FeedbackPass_months_positive" CHECK ("months" > 0),
ADD CONSTRAINT "FeedbackPass_maxUses_positive" CHECK ("maxUses" > 0),
ADD CONSTRAINT "FeedbackPass_uses_capacity" CHECK ("uses" >= 0 AND "uses" <= "maxUses");
