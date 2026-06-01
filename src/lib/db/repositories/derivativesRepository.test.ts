import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import {
  getLatestDerivativesMetrics,
  listDerivativesMetrics,
  upsertDerivativesMetrics
} from "./derivativesRepository";

function createMemoryDatabase() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("derivatives repository", () => {
  it("upserts normalized metrics and summarizes latest context", () => {
    const db = createMemoryDatabase();

    try {
      const changed = upsertDerivativesMetrics(db, [
        {
          symbol: "BTCUSDT",
          period: "1h",
          source: "binance_futures",
          metricTime: 1000,
          fundingRate: 0.0001,
          nextFundingTime: 2000,
          markPrice: 100000,
          indexPrice: 99950,
          openInterest: null,
          openInterestValue: null,
          longShortRatio: null,
          longAccount: null,
          shortAccount: null,
          basis: null,
          basisRate: null,
          annualizedBasisRate: null,
          futuresPrice: null,
          metadataJson: null
        },
        {
          symbol: "BTCUSDT",
          period: "1h",
          source: "binance_futures",
          metricTime: 1000,
          fundingRate: null,
          nextFundingTime: null,
          markPrice: null,
          indexPrice: null,
          openInterest: 1000,
          openInterestValue: 100000000,
          longShortRatio: 1.4,
          longAccount: 0.58,
          shortAccount: 0.42,
          basis: 20,
          basisRate: 0.0002,
          annualizedBasisRate: 0.08,
          futuresPrice: 100020,
          metadataJson: JSON.stringify({ endpoint: "fixture" })
        },
        {
          symbol: "BTCUSDT",
          period: "1h",
          source: "binance_futures",
          metricTime: 2000,
          fundingRate: null,
          nextFundingTime: null,
          markPrice: null,
          indexPrice: null,
          openInterest: 1100,
          openInterestValue: 112000000,
          longShortRatio: null,
          longAccount: null,
          shortAccount: null,
          basis: null,
          basisRate: null,
          annualizedBasisRate: null,
          futuresPrice: null,
          metadataJson: null
        },
        {
          symbol: "BTCUSDT",
          period: "1h",
          source: "binance_futures",
          metricTime: 3000,
          fundingRate: null,
          nextFundingTime: null,
          markPrice: null,
          indexPrice: null,
          openInterest: 1150,
          openInterestValue: null,
          longShortRatio: null,
          longAccount: null,
          shortAccount: null,
          basis: null,
          basisRate: null,
          annualizedBasisRate: null,
          futuresPrice: null,
          metadataJson: null
        }
      ]);

      assert.equal(changed, 4);
      assert.equal(listDerivativesMetrics(db, { symbol: "BTCUSDT", period: "1h" }).length, 3);

      const latest = getLatestDerivativesMetrics(db, {
        symbol: "BTCUSDT",
        period: "1h",
        source: "binance_futures"
      });

      assert.equal(latest?.fundingRate, 0.0001);
      assert.equal(latest?.openInterestValue, 112000000);
      assert.equal(Math.round((latest?.openInterestChangePct ?? 0) * 100) / 100, 12);
      assert.equal(latest?.longShortRatio, 1.4);
      assert.equal(latest?.basisRate, 0.0002);
    } finally {
      db.close();
    }
  });
});
