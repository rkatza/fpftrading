-- CreateEnum
CREATE TYPE "CounterpartyType" AS ENUM ('bank', 'broker', 'dealer');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('active', 'repaid');

-- CreateEnum
CREATE TYPE "HedgeType" AS ENUM ('NDF', 'FORWARD', 'OPTION_CALL', 'OPTION_PUT', 'STRUCTURE');

-- CreateEnum
CREATE TYPE "HedgeDirection" AS ENUM ('buy', 'sell');

-- CreateEnum
CREATE TYPE "HedgeStatus" AS ENUM ('open', 'fixed', 'settled');

-- CreateEnum
CREATE TYPE "QuoteType" AS ENUM ('spot', 'forward_outright', 'forward_points', 'vol_atm', 'vol_rr25', 'vol_bf25', 'interest_rate');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('new', 'reviewed', 'dismissed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Currency" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isNdfOnly" BOOLEAN NOT NULL DEFAULT false,
    "fixingSource" TEXT,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Counterparty" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CounterpartyType" NOT NULL,

    CONSTRAINT "Counterparty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "borrower" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "usdNotional" DECIMAL(18,2) NOT NULL,
    "marketValueUsd" DECIMAL(18,2) NOT NULL,
    "settlementCcy" TEXT NOT NULL,
    "underlyingCcy" TEXT NOT NULL,
    "exposureFactor" DECIMAL(5,4) NOT NULL,
    "startDate" DATE NOT NULL,
    "maturityDate" DATE,
    "status" "PositionStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashBalance" (
    "id" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "ccy" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "asOf" DATE NOT NULL,
    "isMarginAccount" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CashBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hedge" (
    "id" TEXT NOT NULL,
    "type" "HedgeType" NOT NULL,
    "direction" "HedgeDirection" NOT NULL,
    "pair" TEXT NOT NULL,
    "notionalLocal" DECIMAL(18,2) NOT NULL,
    "contractRate" DECIMAL(18,8) NOT NULL,
    "premiumUsd" DECIMAL(18,2),
    "strike2" DECIMAL(18,8),
    "tradeDate" DATE NOT NULL,
    "fixingDate" DATE NOT NULL,
    "settlementDate" DATE NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "status" "HedgeStatus" NOT NULL DEFAULT 'open',
    "settledPnlUsd" DECIMAL(18,2),
    "parentHedgeId" TEXT,
    "notes" TEXT,

    CONSTRAINT "Hedge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketQuote" (
    "id" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "tenor" TEXT NOT NULL,
    "type" "QuoteType" NOT NULL,
    "value" DECIMAL(18,8) NOT NULL,
    "source" TEXT NOT NULL,
    "quotedAt" TIMESTAMP(3) NOT NULL,
    "enteredBy" TEXT,

    CONSTRAINT "MarketQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExposureSnapshot" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "ccy" TEXT NOT NULL,
    "grossExposureUsd" DECIMAL(18,2) NOT NULL,
    "cashUsd" DECIMAL(18,2) NOT NULL,
    "hedgeNotionalUsd" DECIMAL(18,2) NOT NULL,
    "netExposureUsd" DECIMAL(18,2) NOT NULL,
    "hedgeRatio" DECIMAL(9,6) NOT NULL,
    "hedgeMtmUsd" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ExposureSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarginRecord" (
    "id" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "postedUsd" DECIMAL(18,2) NOT NULL,
    "requiredUsd" DECIMAL(18,2) NOT NULL,
    "method" TEXT NOT NULL,

    CONSTRAINT "MarginRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HedgePolicy" (
    "id" TEXT NOT NULL,
    "ccy" TEXT NOT NULL,
    "targetRatioMin" DECIMAL(5,4) NOT NULL,
    "targetRatioMax" DECIMAL(5,4) NOT NULL,

    CONSTRAINT "HedgePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ccy" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "inputsJson" JSONB NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'new',

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "ccy" TEXT,
    "hedgeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Counterparty_name_key" ON "Counterparty"("name");

-- CreateIndex
CREATE INDEX "MarketQuote_pair_type_tenor_quotedAt_idx" ON "MarketQuote"("pair", "type", "tenor", "quotedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExposureSnapshot_date_ccy_key" ON "ExposureSnapshot"("date", "ccy");

-- CreateIndex
CREATE UNIQUE INDEX "HedgePolicy_ccy_key" ON "HedgePolicy"("ccy");

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_underlyingCcy_fkey" FOREIGN KEY ("underlyingCcy") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashBalance" ADD CONSTRAINT "CashBalance_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hedge" ADD CONSTRAINT "Hedge_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hedge" ADD CONSTRAINT "Hedge_parentHedgeId_fkey" FOREIGN KEY ("parentHedgeId") REFERENCES "Hedge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarginRecord" ADD CONSTRAINT "MarginRecord_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
