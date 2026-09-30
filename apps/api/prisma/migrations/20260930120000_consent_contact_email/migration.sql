ALTER TABLE "Consent" ADD COLUMN "contactEmail" TEXT;

-- Earlier consents did not record the configured address, so it cannot be reconstructed.
UPDATE "Consent" SET "contactEmail" = 'unknown@example.invalid' WHERE "contactEmail" IS NULL;

ALTER TABLE "Consent" ALTER COLUMN "contactEmail" SET NOT NULL;
