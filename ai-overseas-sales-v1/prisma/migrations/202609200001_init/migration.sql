CREATE TYPE "LeadGrade" AS ENUM ('A', 'B', 'C', 'D');
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'CONTACTED', 'REPLIED', 'INTERESTED', 'QUOTATION', 'NEGOTIATION', 'WON', 'LOST', 'DO_NOT_CONTACT');
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'TELEGRAM', 'LINKEDIN', 'OTHER');

CREATE TABLE "Company" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "domain" TEXT,
  "website" TEXT,
  "country" TEXT,
  "city" TEXT,
  "industry" TEXT,
  "businessType" TEXT,
  "companySize" TEXT,
  "source" TEXT,
  "sourceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Contact" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "fullName" TEXT,
  "position" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "telegram" TEXT,
  "linkedin" TEXT,
  "language" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Lead" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "contactId" TEXT,
  "grade" "LeadGrade" NOT NULL DEFAULT 'D',
  "score" INTEGER NOT NULL DEFAULT 0,
  "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
  "reason" TEXT,
  "recommendedOffer" TEXT,
  "ownerId" TEXT,
  "firstContactAt" TIMESTAMP(3),
  "lastContactAt" TIMESTAMP(3),
  "nextFollowupAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "country" TEXT,
  "industry" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "dailyLimit" INTEGER NOT NULL DEFAULT 40,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutreachMessage" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "campaignId" TEXT,
  "channel" "MessageChannel" NOT NULL,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "providerId" TEXT,
  "sentAt" TIMESTAMP(3),
  "repliedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Blacklist" (
  "id" TEXT NOT NULL,
  "channel" "MessageChannel" NOT NULL,
  "value" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Blacklist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Activity" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Company_domain_key" ON "Company"("domain");
CREATE INDEX "Company_country_industry_idx" ON "Company"("country", "industry");
CREATE UNIQUE INDEX "Contact_email_key" ON "Contact"("email");
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");
CREATE INDEX "Lead_grade_status_idx" ON "Lead"("grade", "status");
CREATE INDEX "Lead_nextFollowupAt_idx" ON "Lead"("nextFollowupAt");
CREATE INDEX "OutreachMessage_status_createdAt_idx" ON "OutreachMessage"("status", "createdAt");
CREATE UNIQUE INDEX "Blacklist_channel_value_key" ON "Blacklist"("channel", "value");
CREATE INDEX "Activity_leadId_createdAt_idx" ON "Activity"("leadId", "createdAt");

ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OutreachMessage"
  ADD CONSTRAINT "OutreachMessage_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutreachMessage"
  ADD CONSTRAINT "OutreachMessage_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Activity"
  ADD CONSTRAINT "Activity_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
