-- CreateEnum
CREATE TYPE "TransferRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "link" TEXT;

-- CreateTable
CREATE TABLE "client_transfer_requests" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "fromUserId" UUID NOT NULL,
    "toUserId" UUID NOT NULL,
    "initiatedById" UUID NOT NULL,
    "status" "TransferRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,

    CONSTRAINT "client_transfer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_transfer_requests_status_idx" ON "client_transfer_requests"("status");

-- CreateIndex
CREATE INDEX "client_transfer_requests_clientId_status_idx" ON "client_transfer_requests"("clientId", "status");

-- AddForeignKey
ALTER TABLE "client_transfer_requests" ADD CONSTRAINT "client_transfer_requests_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_transfer_requests" ADD CONSTRAINT "client_transfer_requests_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_transfer_requests" ADD CONSTRAINT "client_transfer_requests_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_transfer_requests" ADD CONSTRAINT "client_transfer_requests_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
