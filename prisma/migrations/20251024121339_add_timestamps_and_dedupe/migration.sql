-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- AlterTable
CREATE TABLE "new_Feed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "rssUrl" TEXT NOT NULL,
    "lastItemId" TEXT,
    "lastNotifiedAt" DATETIME,
    "lastSeenAt" DATETIME,
    "checkIntervalMinutes" INTEGER NOT NULL DEFAULT 10,
    "maxAgeMinutes" INTEGER NOT NULL DEFAULT 1440,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastCheck" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Feed_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Copy existing data
INSERT INTO "new_Feed" ("id", "chatId", "name", "url", "rssUrl", "lastItemId", "enabled", "failures", "lastCheck", "createdAt", "updatedAt")
SELECT "id", "chatId", "name", "url", "rssUrl", "lastItemId", "enabled", "failures", "lastCheck", "createdAt", "updatedAt"
FROM "Feed";

-- Drop old table
DROP TABLE "Feed";

-- Rename new table
ALTER TABLE "new_Feed" RENAME TO "Feed";

-- CreateIndex
CREATE UNIQUE INDEX "Feed_chatId_name_key" ON "Feed"("chatId", "name");

-- CreateTable
CREATE TABLE "ItemDedupe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "feedId" TEXT,
    "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ItemDedupe_itemId_idx" ON "ItemDedupe"("itemId");
CREATE INDEX "ItemDedupe_expiresAt_idx" ON "ItemDedupe"("expiresAt");
CREATE INDEX "ItemDedupe_feedId_idx" ON "ItemDedupe"("feedId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

