-- CreateTable
CREATE TABLE "BlockingStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "successfulRequests" INTEGER NOT NULL DEFAULT 0,
    "blockedRequests" INTEGER NOT NULL DEFAULT 0,
    "rateLimitedRequests" INTEGER NOT NULL DEFAULT 0,
    "lastSuccess" DATETIME,
    "lastFailure" DATETIME,
    "currentDelay" REAL NOT NULL DEFAULT 5.0,
    "circuitBreakerState" TEXT NOT NULL DEFAULT 'closed',
    "preferredUserAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BlockingStats_domain_key" ON "BlockingStats"("domain");

-- CreateIndex
CREATE INDEX "BlockingStats_domain_idx" ON "BlockingStats"("domain");
