import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeBasis,
  normalizeFundingRate,
  normalizeLongShortRatio,
  normalizeOpenInterest,
  normalizeOpenInterestHist,
  normalizePremiumIndex
} from "./binanceDerivativesCollector";

describe("binance derivatives collector normalization", () => {
  it("normalizes Binance USD-M futures responses into derivatives metrics", () => {
    const premium = normalizePremiumIndex("BTCUSDT", "1h", {
      symbol: "BTCUSDT",
      markPrice: "100100.5",
      indexPrice: "100000.5",
      lastFundingRate: "0.0003",
      nextFundingTime: 2000,
      time: 1000
    });
    const funding = normalizeFundingRate("BTCUSDT", "1h", {
      symbol: "BTCUSDT",
      fundingRate: "-0.0001",
      fundingTime: 3000,
      markPrice: "99900"
    });
    const openInterest = normalizeOpenInterest("BTCUSDT", "1h", {
      symbol: "BTCUSDT",
      openInterest: "12345.6",
      time: 4000
    });
    const openInterestHist = normalizeOpenInterestHist("BTCUSDT", "1h", {
      symbol: "BTCUSDT",
      sumOpenInterest: "12000",
      sumOpenInterestValue: "1200000000",
      timestamp: "5000"
    });
    const ratio = normalizeLongShortRatio("BTCUSDT", "1h", {
      symbol: "BTCUSDT",
      longShortRatio: "1.55",
      longAccount: "0.61",
      shortAccount: "0.39",
      timestamp: "6000"
    });
    const basis = normalizeBasis("BTCUSDT", "1h", {
      pair: "BTCUSDT",
      contractType: "PERPETUAL",
      basis: "15.5",
      basisRate: "0.00015",
      annualizedBasisRate: "0.12",
      futuresPrice: "100115.5",
      indexPrice: "100100",
      timestamp: 7000
    });

    assert.equal(premium.fundingRate, 0.0003);
    assert.equal(premium.nextFundingTime, 2000);
    assert.equal(funding.fundingRate, -0.0001);
    assert.equal(openInterest.openInterest, 12345.6);
    assert.equal(openInterestHist.openInterestValue, 1200000000);
    assert.equal(ratio.longShortRatio, 1.55);
    assert.equal(ratio.longAccount, 0.61);
    assert.equal(basis.basisRate, 0.00015);
    assert.equal(basis.futuresPrice, 100115.5);
  });
});
