-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "MeetingItemKind" AS ENUM ('ACCOMPLISHED', 'ISSUE', 'OPEN_ISSUE', 'AGREEMENT');

-- CreateEnum
CREATE TYPE "OpenIssueStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "meetingDate" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "place" TEXT,
    "recorder" TEXT,
    "organizer" TEXT,
    "purpose" TEXT,
    "previousId" TEXT,
    "previousNote" TEXT,
    "nextTopic" TEXT,
    "nextDate" DATE,
    "nextStartTime" TEXT,
    "nextEndTime" TEXT,
    "nextPlace" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAttendee" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "position" TEXT,
    "organization" TEXT,
    "projectRole" TEXT,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "MeetingItemKind" NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "dueDate" DATE,
    "status" "OpenIssueStatus" NOT NULL DEFAULT 'OPEN',
    "taskId" TEXT,
    "carriedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_approvedFileId_key" ON "Meeting"("approvedFileId");

-- CreateIndex
CREATE INDEX "Meeting_previousId_idx" ON "Meeting"("previousId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_projectId_code_key" ON "Meeting"("projectId", "code");

-- CreateIndex
CREATE INDEX "MeetingAttendee_meetingId_idx" ON "MeetingAttendee"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingAttendee_projectId_idx" ON "MeetingAttendee"("projectId");

-- CreateIndex
CREATE INDEX "MeetingAttendee_userId_idx" ON "MeetingAttendee"("userId");

-- CreateIndex
CREATE INDEX "MeetingItem_meetingId_idx" ON "MeetingItem"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingItem_projectId_idx" ON "MeetingItem"("projectId");

-- CreateIndex
CREATE INDEX "MeetingItem_taskId_idx" ON "MeetingItem"("taskId");

-- CreateIndex
CREATE INDEX "MeetingItem_carriedFromId_idx" ON "MeetingItem"("carriedFromId");

-- CreateIndex
CREATE INDEX "MeetingItem_ownerId_idx" ON "MeetingItem"("ownerId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_previousId_fkey" FOREIGN KEY ("previousId") REFERENCES "Meeting"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_approvedFileId_fkey" FOREIGN KEY ("approvedFileId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingItem" ADD CONSTRAINT "MeetingItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingItem" ADD CONSTRAINT "MeetingItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingItem" ADD CONSTRAINT "MeetingItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingItem" ADD CONSTRAINT "MeetingItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingItem" ADD CONSTRAINT "MeetingItem_carriedFromId_fkey" FOREIGN KEY ("carriedFromId") REFERENCES "MeetingItem"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
