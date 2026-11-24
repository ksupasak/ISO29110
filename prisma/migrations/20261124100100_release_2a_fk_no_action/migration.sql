-- DropForeignKey
ALTER TABLE "Requirement" DROP CONSTRAINT "Requirement_agreementItemId_fkey";

-- DropForeignKey
ALTER TABLE "RequirementComponent" DROP CONSTRAINT "RequirementComponent_componentId_fkey";

-- DropForeignKey
ALTER TABLE "RequirementComponent" DROP CONSTRAINT "RequirementComponent_requirementId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_milestoneId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_parentId_fkey";

-- DropForeignKey
ALTER TABLE "TaskComponent" DROP CONSTRAINT "TaskComponent_componentId_fkey";

-- DropForeignKey
ALTER TABLE "TaskComponent" DROP CONSTRAINT "TaskComponent_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskRequirement" DROP CONSTRAINT "TaskRequirement_requirementId_fkey";

-- DropForeignKey
ALTER TABLE "TaskRequirement" DROP CONSTRAINT "TaskRequirement_taskId_fkey";

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_agreementItemId_fkey" FOREIGN KEY ("agreementItemId") REFERENCES "AgreementItem"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRequirement" ADD CONSTRAINT "TaskRequirement_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRequirement" ADD CONSTRAINT "TaskRequirement_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComponent" ADD CONSTRAINT "TaskComponent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComponent" ADD CONSTRAINT "TaskComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementComponent" ADD CONSTRAINT "RequirementComponent_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementComponent" ADD CONSTRAINT "RequirementComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

