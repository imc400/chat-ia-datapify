-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "outcome" TEXT,
    "leadTemperature" TEXT NOT NULL DEFAULT 'cold',
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "scheduledMeeting" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokensUsed" INTEGER,
    "responseTimeMs" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadData" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "name" TEXT,
    "businessType" TEXT,
    "hasShopify" BOOLEAN,
    "monthlyRevenueCLP" BIGINT,
    "investsInAds" BOOLEAN,
    "adSpendMonthlyCLP" BIGINT,
    "location" TEXT,
    "painPoints" JSONB,
    "qualificationSignals" JSONB,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationAnalytics" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "userMessages" INTEGER NOT NULL DEFAULT 0,
    "assistantMessages" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTimeMs" INTEGER,
    "nameUsedCount" INTEGER NOT NULL DEFAULT 0,
    "chileanWordsCount" INTEGER NOT NULL DEFAULT 0,
    "rapportMoments" INTEGER NOT NULL DEFAULT 0,
    "questionsAsked" INTEGER NOT NULL DEFAULT 0,
    "conversionRateScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningInsight" (
    "id" TEXT NOT NULL,
    "insightType" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "sampleConversations" JSONB NOT NULL,
    "impactScore" DOUBLE PRECISION,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedToPrompt" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LearningInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeUntil" TIMESTAMP(3),
    "conversationsCount" INTEGER NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION,
    "avgLeadScore" DOUBLE PRECISION,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_phone_idx" ON "Conversation"("phone");

-- CreateIndex
CREATE INDEX "Conversation_createdAt_idx" ON "Conversation"("createdAt");

-- CreateIndex
CREATE INDEX "Conversation_outcome_idx" ON "Conversation"("outcome");

-- CreateIndex
CREATE INDEX "Conversation_leadTemperature_idx" ON "Conversation"("leadTemperature");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Message_timestamp_idx" ON "Message"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "LeadData_conversationId_key" ON "LeadData"("conversationId");

-- CreateIndex
CREATE INDEX "LeadData_conversationId_idx" ON "LeadData"("conversationId");

-- CreateIndex
CREATE INDEX "LeadData_hasShopify_idx" ON "LeadData"("hasShopify");

-- CreateIndex
CREATE INDEX "LeadData_monthlyRevenueCLP_idx" ON "LeadData"("monthlyRevenueCLP");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationAnalytics_conversationId_key" ON "ConversationAnalytics"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationAnalytics_conversationId_idx" ON "ConversationAnalytics"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationAnalytics_conversionRateScore_idx" ON "ConversationAnalytics"("conversionRateScore");

-- CreateIndex
CREATE INDEX "LearningInsight_insightType_idx" ON "LearningInsight"("insightType");

-- CreateIndex
CREATE INDEX "LearningInsight_confidence_idx" ON "LearningInsight"("confidence");

-- CreateIndex
CREATE INDEX "LearningInsight_appliedToPrompt_idx" ON "LearningInsight"("appliedToPrompt");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_version_key" ON "PromptVersion"("version");

-- CreateIndex
CREATE INDEX "PromptVersion_version_idx" ON "PromptVersion"("version");

-- CreateIndex
CREATE INDEX "PromptVersion_activeFrom_idx" ON "PromptVersion"("activeFrom");

-- CreateIndex
CREATE INDEX "PromptVersion_conversionRate_idx" ON "PromptVersion"("conversionRate");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadData" ADD CONSTRAINT "LeadData_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAnalytics" ADD CONSTRAINT "ConversationAnalytics_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
