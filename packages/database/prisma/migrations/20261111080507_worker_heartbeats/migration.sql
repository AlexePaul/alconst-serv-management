-- CreateTable
CREATE TABLE "worker_heartbeats" (
    "name" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,
    "details" JSONB,

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("name")
);

