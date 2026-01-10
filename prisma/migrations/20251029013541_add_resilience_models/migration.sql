-- CreateTable
CREATE TABLE "ConnectionState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "service" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastSuccessfulCall" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "currentRetryDelay" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalDowntime" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" INTEGER,
    "lastErrorDescription" TEXT,
    "lastErrorType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HealthMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "service" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "responseTime" INTEGER,
    "errorCode" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatSettings" (
    "chatId" TEXT NOT NULL PRIMARY KEY,
    "language" TEXT NOT NULL DEFAULT 'en',
    "checkInterval" INTEGER NOT NULL DEFAULT 120,
    "maxFeeds" INTEGER NOT NULL DEFAULT 50,
    "enableFilters" BOOLEAN NOT NULL DEFAULT true,
    "messageTemplate" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "rateLimitEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxRequestsPerMinute" INTEGER NOT NULL DEFAULT 3,
    "minDelayMs" INTEGER NOT NULL DEFAULT 200000,
    "cacheEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cacheTTLMinutes" INTEGER NOT NULL DEFAULT 20,
    "retryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 10,
    CONSTRAINT "ChatSettings_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChatSettings" ("cacheEnabled", "cacheTTLMinutes", "chatId", "checkInterval", "enableFilters", "language", "maxFeeds", "maxRequestsPerMinute", "maxRetries", "messageTemplate", "minDelayMs", "rateLimitEnabled", "retryEnabled", "timeoutSeconds", "timezone") SELECT "cacheEnabled", "cacheTTLMinutes", "chatId", "checkInterval", "enableFilters", "language", "maxFeeds", "maxRequestsPerMinute", "maxRetries", "messageTemplate", "minDelayMs", "rateLimitEnabled", "retryEnabled", "timeoutSeconds", "timezone" FROM "ChatSettings";
DROP TABLE "ChatSettings";
ALTER TABLE "new_ChatSettings" RENAME TO "ChatSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionState_service_key" ON "ConnectionState"("service");

-- CreateIndex
CREATE INDEX "HealthMetric_service_timestamp_idx" ON "HealthMetric"("service", "timestamp");

-- CreateIndex
CREATE INDEX "HealthMetric_metricType_timestamp_idx" ON "HealthMetric"("metricType", "timestamp");
