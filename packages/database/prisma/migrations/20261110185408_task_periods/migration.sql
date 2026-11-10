-- Termene flexibile: o activitate recurentă poate fi făcută oricând în perioada în care cade
-- (luna sau săptămâna) și devine restantă abia după încheierea perioadei.

-- AlterTable
ALTER TABLE "obligations" ADD COLUMN     "dueWithinPeriod" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "periodEnd" DATE,
ADD COLUMN     "periodStart" DATE;

-- Task-urile deja generate primesc perioada apariției lor: luna calendaristică pentru
-- frecvențele în luni sau ani, săptămâna (luni–duminică) pentru cele în săptămâni.
UPDATE "tasks" t
SET "periodStart" = date_trunc('month', t."occurrenceDate")::date,
    "periodEnd" = (date_trunc('month', t."occurrenceDate") + interval '1 month' - interval '1 day')::date
FROM "obligations" o
WHERE o."id" = t."obligationId"
  AND t."occurrenceDate" IS NOT NULL
  AND o."recurrenceUnit" IN ('MONTH', 'YEAR');

UPDATE "tasks" t
SET "periodStart" = date_trunc('week', t."occurrenceDate")::date,
    "periodEnd" = (date_trunc('week', t."occurrenceDate") + interval '6 days')::date
FROM "obligations" o
WHERE o."id" = t."obligationId"
  AND t."occurrenceDate" IS NOT NULL
  AND o."recurrenceUnit" = 'WEEK';
