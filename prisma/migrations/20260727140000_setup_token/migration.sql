-- First-administrator bootstrap.
--
-- Lets a fresh installation create its first admin without working email, and
-- without shipping a default password. Additive only.

CREATE TABLE "SetupToken" (
    "id"        TEXT NOT NULL,
    -- SHA-256 of the token. The plaintext is printed once by the installer and
    -- never stored, so a database leak does not yield a usable setup link.
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetupToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SetupToken_tokenHash_key" ON "SetupToken"("tokenHash");
CREATE INDEX "SetupToken_expiresAt_idx" ON "SetupToken"("expiresAt");
