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
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "rateLimitEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxRequestsPerMinute" INTEGER NOT NULL DEFAULT 30,
    "minDelayMs" INTEGER NOT NULL DEFAULT 1000,
    "cacheEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cacheTTLMinutes" INTEGER NOT NULL DEFAULT 20,
    "retryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 10,
    CONSTRAINT "ChatSettings_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChatSettings" ("chatId", "checkInterval", "enableFilters", "language", "maxFeeds", "messageTemplate", "timezone") SELECT "chatId", "checkInterval", "enableFilters", "language", "maxFeeds", "messageTemplate", "timezone" FROM "ChatSettings";
DROP TABLE "ChatSettings";
ALTER TABLE "new_ChatSettings" RENAME TO "ChatSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
