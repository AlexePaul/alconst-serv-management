-- DropForeignKey
ALTER TABLE "client_transfer_requests" DROP CONSTRAINT "client_transfer_requests_clientId_fkey";

-- DropForeignKey
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_clientId_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_clientId_fkey";

-- DropForeignKey
ALTER TABLE "locations" DROP CONSTRAINT "locations_clientId_fkey";

-- DropForeignKey
ALTER TABLE "obligations" DROP CONSTRAINT "obligations_clientId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_clientId_fkey";

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_transfer_requests" ADD CONSTRAINT "client_transfer_requests_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
