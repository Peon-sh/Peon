-- CreateTable
CREATE TABLE "UserAttribution" (
    "userId" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "ref" TEXT,
    "gclid" TEXT,
    "fbclid" TEXT,
    "msclkid" TEXT,
    "campaign" TEXT,
    "landingPath" TEXT,
    "landingUrl" TEXT,
    "referrer" TEXT,
    "rawQuery" JSONB,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAttribution_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserAttribution" ADD CONSTRAINT "UserAttribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
