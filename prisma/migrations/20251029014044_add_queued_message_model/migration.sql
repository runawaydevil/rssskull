-- CreateTable
CREATE TABLE "QueuedMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "messageData" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "enqueuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "expiresAt" DATETIME NOT NULL,
    "lastError" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "QueuedMessage_status_priority_enqueuedAt_idx" ON "QueuedMessage"("status", "priority", "enqueuedAt");

-- CreateIndex
CREATE INDEX "QueuedMessage_expiresAt_idx" ON "QueuedMessage"("expiresAt");

-- CreateIndex
CREATE INDEX "QueuedMessage_chatId_idx" ON "QueuedMessage"("chatId");
