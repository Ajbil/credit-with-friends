CREATE TABLE "CircleRemovalBlock" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "circleId" UUID NOT NULL,
  "memberId" UUID NOT NULL,
  "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAtUtc" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CircleRemovalBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CircleRemovalBlock_circleId_memberId_key" ON "CircleRemovalBlock"("circleId", "memberId");
CREATE INDEX "idx_CircleRemovalBlock_circleId" ON "CircleRemovalBlock"("circleId");
CREATE INDEX "idx_CircleRemovalBlock_memberId" ON "CircleRemovalBlock"("memberId");
ALTER TABLE "CircleRemovalBlock" ADD CONSTRAINT "CircleRemovalBlock_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleRemovalBlock" ADD CONSTRAINT "CircleRemovalBlock_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
