import type Database from "better-sqlite3";
import WebSocket from "ws";
import type { NewLiquidationEvent } from "@/lib/db/types";
import { insertLiquidationEvents } from "@/lib/db/repositories/liquidityRepository";

export const BINANCE_LIQUIDATION_STREAM_SOURCE = "binance_futures";
export const BINANCE_LIQUIDATION_STREAM_COLLECTOR_ID = "binance_liquidation_stream";
export const BINANCE_LIQUIDATION_STREAM_URL = "wss://fstream.binance.com/ws/!forceOrder@arr";

type LiquidationOrderSide = "BUY" | "SELL";

interface BinanceForceOrderPayload {
  e?: string;
  E?: number | string;
  o?: {
    s?: string;
    S?: string;
    o?: string;
    f?: string;
    q?: string | number;
    p?: string | number;
    ap?: string | number;
    X?: string;
    l?: string | number;
    z?: string | number;
    T?: number | string;
  };
}

export interface LiquidationWebSocket {
  close(code?: number, reason?: string): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "error", listener: (event: unknown) => void): void;
  addEventListener(type: "close", listener: (event: unknown) => void): void;
}

export interface BinanceLiquidationStreamState {
  started: boolean;
  connected: boolean;
  reconnecting: boolean;
  url: string;
  symbols: string[];
  messagesReceived: number;
  eventsReceived: number;
  eventsStored: number;
  lastMessageAt: string | null;
  lastError: string | null;
  reconnectAttempts: number;
}

export interface BinanceLiquidationStreamOptions {
  db: Database.Database;
  symbols: string[];
  url?: string;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  websocketFactory?: (url: string) => LiquidationWebSocket;
  logger?: Pick<Console, "warn" | "error">;
}

function toFiniteNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getPayloadItems(payload: unknown): BinanceForceOrderPayload[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord) as BinanceForceOrderPayload[];
  }

  if (isRecord(payload)) {
    return [payload as BinanceForceOrderPayload];
  }

  return [];
}

export function mapBinanceOrderSideToLiquidationSide(side: string) {
  const normalized = side.toUpperCase();

  if (normalized === "SELL") {
    return "long_liquidated" as const;
  }

  if (normalized === "BUY") {
    return "short_liquidated" as const;
  }

  return null;
}

export function parseBinanceLiquidationPayload(
  payload: unknown,
  options: {
    allowedSymbols?: string[];
    source?: string;
  } = {}
): NewLiquidationEvent[] {
  const allowedSymbols = new Set((options.allowedSymbols ?? []).map((symbol) => symbol.toUpperCase()));
  const source = options.source ?? BINANCE_LIQUIDATION_STREAM_SOURCE;
  const events: NewLiquidationEvent[] = [];

  for (const item of getPayloadItems(payload)) {
    const order = item.o;

    if (!order) {
      continue;
    }

    const symbol = String(order.s ?? "").toUpperCase();

    if (!symbol || (allowedSymbols.size > 0 && !allowedSymbols.has(symbol))) {
      continue;
    }

    const orderSide = String(order.S ?? "").toUpperCase() as LiquidationOrderSide;
    const liquidationSide = mapBinanceOrderSideToLiquidationSide(orderSide);
    const eventTime = toFiniteNumber(order.T ?? item.E);
    const price = toFiniteNumber(order.ap ?? order.p);
    const quantity = toFiniteNumber(order.z ?? order.l ?? order.q);

    if (!liquidationSide || eventTime === null || price === null || quantity === null || price <= 0 || quantity <= 0) {
      continue;
    }

    const notionalUsd = price * quantity;
    const eventId = [
      source,
      symbol,
      eventTime,
      liquidationSide,
      orderSide,
      price,
      quantity
    ].join(":");

    events.push({
      eventId,
      symbol,
      source,
      eventTime,
      side: liquidationSide,
      orderSide,
      price,
      quantity,
      notionalUsd,
      metadataJson: JSON.stringify({
        stream: "!forceOrder@arr",
        eventType: item.e ?? "forceOrder",
        eventTime: toFiniteNumber(item.E),
        orderType: order.o ?? null,
        timeInForce: order.f ?? null,
        orderStatus: order.X ?? null
      })
    });
  }

  return events;
}

function defaultWebSocketFactory(url: string): LiquidationWebSocket {
  const socket = new WebSocket(url, {
    headers: {
      "User-Agent": "LariPulse/0.1"
    }
  });

  return {
    close(code?: number, reason?: string) {
      socket.close(code, reason);
    },
    addEventListener(type, listener) {
      if (type === "message") {
        socket.on("message", (data) => listener({ data: data.toString() }));
        return;
      }

      socket.on(type, listener as () => void);
    }
  };
}

function eventErrorMessage(event: unknown) {
  if (event instanceof Error) {
    return event.message;
  }

  if (isRecord(event) && "message" in event && typeof event.message === "string") {
    return event.message;
  }

  return "Binance liquidation stream connection event";
}

export class BinanceLiquidationEventStream {
  private readonly db: Database.Database;
  private readonly url: string;
  private readonly symbols: string[];
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly websocketFactory: (url: string) => LiquidationWebSocket;
  private readonly logger: Pick<Console, "warn" | "error">;
  private socket: LiquidationWebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyStopped = true;
  private state: BinanceLiquidationStreamState;

  constructor(options: BinanceLiquidationStreamOptions) {
    this.db = options.db;
    this.url = options.url ?? BINANCE_LIQUIDATION_STREAM_URL;
    this.symbols = options.symbols.map((symbol) => symbol.toUpperCase());
    this.reconnectBaseMs = Math.max(250, options.reconnectBaseMs ?? 1_000);
    this.reconnectMaxMs = Math.max(this.reconnectBaseMs, options.reconnectMaxMs ?? 30_000);
    this.websocketFactory = options.websocketFactory ?? defaultWebSocketFactory;
    this.logger = options.logger ?? console;
    this.state = {
      started: false,
      connected: false,
      reconnecting: false,
      url: this.url,
      symbols: [...this.symbols],
      messagesReceived: 0,
      eventsReceived: 0,
      eventsStored: 0,
      lastMessageAt: null,
      lastError: null,
      reconnectAttempts: 0
    };
  }

  start() {
    if (this.state.started) {
      return this.getState();
    }

    this.manuallyStopped = false;
    this.state.started = true;
    this.connect();

    return this.getState();
  }

  stop() {
    this.manuallyStopped = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close(1000, "LariPulse liquidation stream stopped");
      this.socket = null;
    }

    this.state.started = false;
    this.state.connected = false;
    this.state.reconnecting = false;

    return this.getState();
  }

  getState(): BinanceLiquidationStreamState {
    return {
      ...this.state,
      symbols: [...this.state.symbols]
    };
  }

  private connect() {
    try {
      this.socket = this.websocketFactory(this.url);
    } catch (error) {
      this.handleError(error);
      this.scheduleReconnect();
      return;
    }

    this.socket.addEventListener("open", () => {
      this.state.connected = true;
      this.state.reconnecting = false;
      this.state.reconnectAttempts = 0;
    });

    this.socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });

    this.socket.addEventListener("error", (event) => {
      this.handleError(event);
    });

    this.socket.addEventListener("close", () => {
      this.state.connected = false;

      if (!this.manuallyStopped) {
        this.scheduleReconnect();
      }
    });
  }

  private handleMessage(data: unknown) {
    try {
      this.state.messagesReceived += 1;
      this.state.lastMessageAt = new Date().toISOString();
      const text = typeof data === "string" ? data : String(data);
      const payload = JSON.parse(text) as unknown;
      const events = parseBinanceLiquidationPayload(payload, {
        allowedSymbols: this.symbols
      });

      this.state.eventsReceived += events.length;

      if (events.length > 0) {
        this.state.eventsStored += insertLiquidationEvents(this.db, events);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    const message = eventErrorMessage(error);
    this.state.lastError = message;
    this.logger.warn("[binance-liquidation-stream]", message);
  }

  private scheduleReconnect() {
    if (this.manuallyStopped || this.reconnectTimer) {
      return;
    }

    this.state.reconnecting = true;
    this.state.reconnectAttempts += 1;
    const delayMs = Math.min(
      this.reconnectMaxMs,
      this.reconnectBaseMs * 2 ** Math.max(0, this.state.reconnectAttempts - 1)
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);

    this.reconnectTimer.unref?.();
  }
}
