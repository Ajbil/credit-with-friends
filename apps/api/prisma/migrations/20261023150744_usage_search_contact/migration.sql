-- AlterTable
ALTER TABLE "UsageEvent" ADD COLUMN     "bankId" TEXT,
ADD COLUMN     "cardType" TEXT,
ADD COLUMN     "holderMemberId" UUID,
ADD COLUMN     "peopleFound" INTEGER;

-- CreateIndex
CREATE INDEX "idx_UsageEvent_holderMemberId" ON "UsageEvent"("holderMemberId");

-- CreateIndex
CREATE INDEX "idx_UsageEvent_bankId_cardType" ON "UsageEvent"("bankId", "cardType");

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_holderMemberId_fkey" FOREIGN KEY ("holderMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
