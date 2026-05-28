import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import { getLiquidationEvents } from "@/lib/db/repositories/liquidityRepository";
import {
  BinanceLiquidationEventStream,
  mapBinanceOrderSideToLiquidationSide,
  parseBinanceLiquidationPayload,
  type LiquidationWebSocket
} from "./binanceLiquidationStreamCollector";

class FakeWebSocket {
  private listeners: Record<string, Array<(event?: unknown) => void>> = {};

  close() {
    this.emit("close", {});
  }

  addEventListener(type: string, listener: (event?: unknown) => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
  }

  emit(type: string, event?: unknown) {
    for (const listener of this.listeners[type] ?? []) {
      listener(event);
    }
  }
}

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("Binance liquidation stream collector", () => {
  it("maps Binance order sides to liquidated positions", () => {
    assert.equal(mapBinanceOrderSideToLiquidationSide("SELL"), "long_liquidated");
    assert.equal(mapBinanceOrderSideToLiquidationSide("BUY"), "short_liquidated");
    assert.equal(mapBinanceOrderSideToLiquidationSide("HOLD"), null);
  });

  it("normalizes force-order payloads into liquidation events", () => {
    const events = parseBinanceLiquidationPayload(
      {
        e: "forceOrder",
        E: 1710000000100,
        o: {
          s: "BTCUSDT",
          S: "SELL",
          q: "0.5",
          p: "100000",
          ap: "99950",
          X: "FILLED",
          T: 1710000000000
        }
      },
      { allowedSymbols: ["BTCUSDT"] }
    );

    assert.equal(events.length, 1);
    assert.equal(events[0].symbol, "BTCUSDT");
    assert.equal(events[0].side, "long_liquidated");
    assert.equal(events[0].orderSide, "SELL");
    assert.equal(events[0].price, 99950);
    assert.equal(events[0].quantity, 0.5);
    assert.equal(events[0].notionalUsd, 49975);
  });

  it("filters unsupported symbols and malformed orders", () => {
    const events = parseBinanceLiquidationPayload(
      [
        { o: { s: "DOGEUSDT", S: "SELL", q: "1", ap: "1", T: 1000 } },
        { o: { s: "BTCUSDT", S: "SELL", q: "0", ap: "100000", T: 1000 } },
        { o: { s: "BTCUSDT", S: "BUY", q: "0.2", ap: "100000", T: 1000 } }
      ],
      { allowedSymbols: ["BTCUSDT"] }
    );

    assert.equal(events.length, 1);
    assert.equal(events[0].side, "short_liquidated");
  });

  it("stores parsed messages and tracks runtime state", () => {
    const db = makeDb();
    const socket = new FakeWebSocket();
    const stream = new BinanceLiquidationEventStream({
      db,
      symbols: ["BTCUSDT"],
      websocketFactory: () => socket as unknown as LiquidationWebSocket,
      logger: { warn() {}, error() {} }
    });

    stream.start();
    socket.emit("open");
    socket.emit("message", {
      data: JSON.stringify({
        e: "forceOrder",
        E: 1710000000000,
        o: {
          s: "BTCUSDT",
          S: "BUY",
          q: "0.25",
          ap: "100000",
          T: 1710000000000
        }
      })
    });
    socket.emit("message", {
      data: JSON.stringify({
        e: "forceOrder",
        E: 1710000000500,
        o: {
          s: "DOGEUSDT",
          S: "BUY",
          q: "10",
          ap: "1",
          T: 1710000000500
        }
      })
    });

    const state = stream.getState();
    const rows = getLiquidationEvents(db, {
      symbol: "BTCUSDT",
      fromTime: 1709999999000,
      toTime: 1710000001000
    });

    assert.equal(state.connected, true);
    assert.equal(state.messagesReceived, 2);
    assert.equal(state.eventsReceived, 1);
    assert.equal(state.eventsStored, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].side, "short_liquidated");
    assert.equal(rows[0].liquidationSide, "short");

    stream.stop();
    assert.equal(stream.getState().started, false);
  });
});
