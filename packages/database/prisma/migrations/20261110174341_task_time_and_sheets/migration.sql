-- AlterTable
ALTER TABLE "obligations" ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "startTime" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "sheetsCompletedAt" TIMESTAMP(3),
ADD COLUMN     "sheetsCompletedById" UUID,
ADD COLUMN     "startTime" TEXT;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sheetsCompletedById_fkey" FOREIGN KEY ("sheetsCompletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
