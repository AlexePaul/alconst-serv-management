-- Aplicația nu mai ține evidența nominală a angajaților clienților (date personale),
-- ci doar numărul lor, pe client.

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "employeeCount" INTEGER,
ADD COLUMN     "employeeCountCheckedAt" TIMESTAMP(3);

-- Numărul de pornire: câți angajați activi erau înregistrați pentru fiecare client.
UPDATE "clients" c
SET "employeeCount" = e.total
FROM (
  SELECT "clientId", COUNT(*)::int AS total
  FROM "employees"
  WHERE "isActive" = true
  GROUP BY "clientId"
) e
WHERE e."clientId" = c."id";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_clientId_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_locationId_fkey";

-- DropTable
DROP TABLE "employees";
