-- CreateTable
CREATE TABLE "ServiceContainerLog" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "deploymentId" TEXT,
    "containerName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceContainerLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceContainerLog_serviceId_capturedAt_idx" ON "ServiceContainerLog"("serviceId", "capturedAt");

-- AddForeignKey
ALTER TABLE "ServiceContainerLog" ADD CONSTRAINT "ServiceContainerLog_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContainerLog" ADD CONSTRAINT "ServiceContainerLog_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
