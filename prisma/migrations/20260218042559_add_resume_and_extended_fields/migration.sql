-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApplicationStatus" ADD VALUE 'SAVED';
ALTER TYPE "ApplicationStatus" ADD VALUE 'GHOSTED';
ALTER TYPE "ApplicationStatus" ADD VALUE 'WITHDRAWN';

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "fitScore" DOUBLE PRECISION,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "niceToHaves" TEXT[],
ADD COLUMN     "rawDescription" TEXT,
ADD COLUMN     "requirements" TEXT[],
ADD COLUMN     "salaryRange" TEXT,
ADD COLUMN     "skillGaps" TEXT[],
ADD COLUMN     "skillMatches" TEXT[];

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "skills" TEXT[],
    "experience" TEXT,
    "education" TEXT,
    "rawText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);
