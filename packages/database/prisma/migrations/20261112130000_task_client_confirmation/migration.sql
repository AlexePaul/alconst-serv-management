-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "clientConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "clientConfirmedById" UUID;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_clientConfirmedById_fkey" FOREIGN KEY ("clientConfirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
