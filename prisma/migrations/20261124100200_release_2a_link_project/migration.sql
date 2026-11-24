-- AlterTable
ALTER TABLE "RequirementComponent" ADD COLUMN     "projectId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TaskComponent" ADD COLUMN     "projectId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TaskRequirement" ADD COLUMN     "projectId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "RequirementComponent_projectId_idx" ON "RequirementComponent"("projectId");

-- CreateIndex
CREATE INDEX "TaskComponent_projectId_idx" ON "TaskComponent"("projectId");

-- CreateIndex
CREATE INDEX "TaskRequirement_projectId_idx" ON "TaskRequirement"("projectId");

-- AddForeignKey
ALTER TABLE "TaskRequirement" ADD CONSTRAINT "TaskRequirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComponent" ADD CONSTRAINT "TaskComponent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementComponent" ADD CONSTRAINT "RequirementComponent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

