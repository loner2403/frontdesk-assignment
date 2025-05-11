-- CreateEnum
CREATE TYPE "HelpRequestStatus" AS ENUM ('pending', 'resolved', 'unresolved');

-- CreateTable
CREATE TABLE "HelpRequest" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "callerInfo" JSONB,
    "status" "HelpRequestStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "supervisorResponse" TEXT,
    "knowledgeBaseEntryId" TEXT,

    CONSTRAINT "HelpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBaseEntry" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,

    CONSTRAINT "KnowledgeBaseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HelpRequest_knowledgeBaseEntryId_key" ON "HelpRequest"("knowledgeBaseEntryId");

-- AddForeignKey
ALTER TABLE "HelpRequest" ADD CONSTRAINT "HelpRequest_knowledgeBaseEntryId_fkey" FOREIGN KEY ("knowledgeBaseEntryId") REFERENCES "KnowledgeBaseEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
