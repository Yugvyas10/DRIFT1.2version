-- CreateEnum
CREATE TYPE "RunMode" AS ENUM ('UPLOAD', 'SERVER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RunStatus" ADD VALUE 'QUEUED';
ALTER TYPE "RunStatus" ADD VALUE 'RUNNING';

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "mode" "RunMode" NOT NULL DEFAULT 'UPLOAD',
ADD COLUMN     "options" JSONB,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ALTER COLUMN "baseSpecHash" DROP NOT NULL,
ALTER COLUMN "headSpecHash" DROP NOT NULL,
ALTER COLUMN "engineVersion" DROP NOT NULL,
ALTER COLUMN "rulesVersion" DROP NOT NULL,
ALTER COLUMN "rulesHash" DROP NOT NULL,
ALTER COLUMN "policyHash" DROP NOT NULL,
ALTER COLUMN "gatePassed" DROP NOT NULL,
ALTER COLUMN "failOn" DROP NOT NULL,
ALTER COLUMN "breaking" DROP NOT NULL,
ALTER COLUMN "risky" DROP NOT NULL,
ALTER COLUMN "safe" DROP NOT NULL,
ALTER COLUMN "suppressed" DROP NOT NULL,
ALTER COLUMN "semver" DROP NOT NULL;

