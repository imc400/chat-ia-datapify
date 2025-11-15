-- AlterTable
ALTER TABLE "LeadData" ADD COLUMN     "calendarSyncedAt" TIMESTAMP(3),
ADD COLUMN     "conversionDate" TIMESTAMP(3),
ADD COLUMN     "conversionNotes" TEXT,
ADD COLUMN     "conversionStatus" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateIndex
CREATE INDEX "LeadData_conversionStatus_idx" ON "LeadData"("conversionStatus");

-- CreateIndex
CREATE INDEX "LeadData_email_idx" ON "LeadData"("email");
