CREATE TABLE "Circle" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "name" TEXT NOT NULL,
  "inviteCode" TEXT,
  "adminMemberId" UUID,
  "isOwnerCreated" BOOLEAN NOT NULL,
  "createdByAccountId" UUID,
  "modifiedByAccountId" UUID,
  "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAtUtc" TIMESTAMP(3) NOT NULL,
  "deletedAtUtc" TIMESTAMP(3),
  CONSTRAINT "Circle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Circle_active_invite_check" CHECK ("deletedAtUtc" IS NOT NULL OR "inviteCode" IS NOT NULL)
);
CREATE UNIQUE INDEX "Circle_inviteCode_key" ON "Circle"("inviteCode");
CREATE INDEX "idx_Circle_adminMemberId" ON "Circle"("adminMemberId");
CREATE INDEX "idx_Circle_createdByAccountId" ON "Circle"("createdByAccountId");
CREATE INDEX "idx_Circle_modifiedByAccountId" ON "Circle"("modifiedByAccountId");
ALTER TABLE "Circle" ADD CONSTRAINT "Circle_adminMemberId_fkey" FOREIGN KEY ("adminMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Circle" ADD CONSTRAINT "Circle_createdByAccountId_fkey" FOREIGN KEY ("createdByAccountId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Circle" ADD CONSTRAINT "Circle_modifiedByAccountId_fkey" FOREIGN KEY ("modifiedByAccountId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CircleMembership" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "circleId" UUID NOT NULL,
  "memberId" UUID NOT NULL,
  "joinedAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAtUtc" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CircleMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CircleMembership_circleId_memberId_key" ON "CircleMembership"("circleId", "memberId");
CREATE INDEX "idx_CircleMembership_circleId" ON "CircleMembership"("circleId");
CREATE INDEX "idx_CircleMembership_memberId" ON "CircleMembership"("memberId");
ALTER TABLE "CircleMembership" ADD CONSTRAINT "CircleMembership_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleMembership" ADD CONSTRAINT "CircleMembership_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UsageEvent" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "type" TEXT NOT NULL,
  "memberId" UUID,
  "occurredAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAtUtc" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_UsageEvent_memberId" ON "UsageEvent"("memberId");
CREATE INDEX "idx_UsageEvent_type" ON "UsageEvent"("type");
CREATE INDEX "idx_UsageEvent_occurredAtUtc" ON "UsageEvent"("occurredAtUtc");
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "UsageEventCircle" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "usageEventId" UUID NOT NULL,
  "circleId" UUID NOT NULL,
  "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAtUtc" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsageEventCircle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UsageEventCircle_usageEventId_circleId_key" ON "UsageEventCircle"("usageEventId", "circleId");
CREATE INDEX "idx_UsageEventCircle_usageEventId" ON "UsageEventCircle"("usageEventId");
CREATE INDEX "idx_UsageEventCircle_circleId" ON "UsageEventCircle"("circleId");
ALTER TABLE "UsageEventCircle" ADD CONSTRAINT "UsageEventCircle_usageEventId_fkey" FOREIGN KEY ("usageEventId") REFERENCES "UsageEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsageEventCircle" ADD CONSTRAINT "UsageEventCircle_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
