-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "PendingSignIn" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "googleAccountId" TEXT NOT NULL,
    "googleName" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "lastActivityAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAtUtc" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingSignIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "googleAccountId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "whatsappE164" TEXT NOT NULL,
    "isAdultConfirmed" BOOLEAN NOT NULL,
    "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAtUtc" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "memberId" UUID,
    "pendingSignInId" UUID,
    "tokenHash" TEXT NOT NULL,
    "lastSeenAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAtUtc" TIMESTAMP(3) NOT NULL,
    "userAgentLabel" TEXT,
    "returnPath" TEXT NOT NULL DEFAULT '/',
    "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAtUtc" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Session_owner_check" CHECK (("memberId" IS NOT NULL) <> ("pendingSignInId" IS NOT NULL))
);

-- CreateTable
CREATE TABLE "PrivacyNoticeVersion" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "version" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "isMaterialChange" BOOLEAN NOT NULL,
    "publishedAtUtc" TIMESTAMP(3),
    "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAtUtc" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyNoticeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "memberId" UUID NOT NULL,
    "privacyNoticeVersionId" UUID NOT NULL,
    "acceptedAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAtUtc" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingSignIn_googleAccountId_key" ON "PendingSignIn"("googleAccountId");

-- CreateIndex
CREATE INDEX "idx_PendingSignIn_lastActivityAtUtc" ON "PendingSignIn"("lastActivityAtUtc");

-- CreateIndex
CREATE UNIQUE INDEX "Member_googleAccountId_key" ON "Member"("googleAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "idx_Session_memberId" ON "Session"("memberId");

-- CreateIndex
CREATE INDEX "idx_Session_pendingSignInId" ON "Session"("pendingSignInId");

-- CreateIndex
CREATE INDEX "idx_Session_expiresAtUtc" ON "Session"("expiresAtUtc");

-- CreateIndex
CREATE UNIQUE INDEX "PrivacyNoticeVersion_version_key" ON "PrivacyNoticeVersion"("version");

-- CreateIndex
CREATE INDEX "idx_Consent_memberId" ON "Consent"("memberId");

-- CreateIndex
CREATE INDEX "idx_Consent_privacyNoticeVersionId" ON "Consent"("privacyNoticeVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Consent_memberId_privacyNoticeVersionId_key" ON "Consent"("memberId", "privacyNoticeVersionId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_pendingSignInId_fkey" FOREIGN KEY ("pendingSignInId") REFERENCES "PendingSignIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_privacyNoticeVersionId_fkey" FOREIGN KEY ("privacyNoticeVersionId") REFERENCES "PrivacyNoticeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
