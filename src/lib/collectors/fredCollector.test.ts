import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { fetchFredDailySeries, normalizeFredRow } from "./fredCollector";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("FRED collector", () => {
  it("normalizes daily CSV observations into internal candles", async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));

      return new Response(
        [
          "observation_date,DGS10",
          "2026-05-19,4.01",
          "2026-05-20,.",
          "2026-05-21,4.08",
          "2026-05-22,4.12"
        ].join("\n"),
        { status: 200 }
      );
    }) as typeof fetch;

    const result = await fetchFredDailySeries({
      symbol: "US10Y",
      seriesId: "DGS10",
      timeframe: "1d",
      limit: 2
    });

    assert.equal(result.symbol, "US10Y");
    assert.equal(result.timeframe, "1d");
    assert.equal(result.candles.length, 2);
    assert.equal(result.candles[0].source, "fred");
    assert.equal(result.candles[0].openTime, Date.UTC(2026, 4, 21));
    assert.equal(result.candles[0].volume, 0);
    assert.equal(result.candles[1].close, 4.12);
    assert.match(requestedUrls[0], /id=DGS10/);
  });

  it("rejects unsupported intraday timeframes", async () => {
    await assert.rejects(
      () =>
        fetchFredDailySeries({
          symbol: "US10Y",
          seriesId: "DGS10",
          timeframe: "1h",
          limit: 10
        }),
      /supports only 1d/
    );
  });

  it("validates observation values and dates", () => {
    assert.throws(
      () =>
        normalizeFredRow("US10Y", "1d", {
          date: "invalid",
          value: "4.12"
        }),
      /Invalid FRED observation date/
    );

    assert.throws(
      () =>
        normalizeFredRow("US10Y", "1d", {
          date: "2026-05-22",
          value: "bad"
        }),
      /Invalid FRED observation value/
    );
  });
});
