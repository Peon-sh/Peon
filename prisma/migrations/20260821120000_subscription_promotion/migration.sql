-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "promotionCode" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "stripeCouponId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "hasActivePromotion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subscription" ADD COLUMN "promotionCodeEver" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "promotionCodeAppliedAt" TIMESTAMP(3);
