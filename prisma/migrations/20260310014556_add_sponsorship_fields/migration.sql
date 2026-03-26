/*
  Warnings:

  - You are about to alter the column `fitScore` on the `Application` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.

*/
-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "sponsorsH1B" TEXT,
ADD COLUMN     "sponsorshipNotes" TEXT,
ALTER COLUMN "fitScore" SET DATA TYPE INTEGER;
