-- AlterTable
ALTER TABLE "Subscription" RENAME COLUMN "stripePlanId" TO "stripePriceId";

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "stripeSubscriptionItemId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "interval" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subscription" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "canceledAt" TIMESTAMP(3);
