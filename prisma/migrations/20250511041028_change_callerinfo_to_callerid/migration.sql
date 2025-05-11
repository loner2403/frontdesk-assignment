/*
  Warnings:

  - You are about to drop the column `callerInfo` on the `HelpRequest` table. All the data in the column will be lost.
  - Added the required column `callerId` to the `HelpRequest` table without a default value. This is not possible if the table is not empty.

*/
-- First add the callerId column as nullable
ALTER TABLE "HelpRequest" ADD COLUMN "callerId" TEXT;

-- Extract callerId from callerInfo JSON
UPDATE "HelpRequest" 
SET "callerId" = "callerInfo"->>'callerId' 
WHERE "callerInfo" IS NOT NULL;

-- Set default value for any NULL callerId
UPDATE "HelpRequest"
SET "callerId" = 'unknown'
WHERE "callerId" IS NULL;

-- Now make callerId NOT NULL
ALTER TABLE "HelpRequest" ALTER COLUMN "callerId" SET NOT NULL;

-- Finally drop the callerInfo column
ALTER TABLE "HelpRequest" DROP COLUMN "callerInfo";
