import type { WidgetEngine } from "./types";
import { cryptoWidgets } from "./crypto";
import { liquidityWidgets } from "./liquidity";
import { derivativesWidgets } from "./derivatives";

export class WidgetRegistry {
  private readonly engines = new Map<string, WidgetEngine>();

  constructor(engines: WidgetEngine[] = []) {
    for (const engine of engines) {
      this.register(engine);
    }
  }

  register(engine: WidgetEngine) {
    if (this.engines.has(engine.id)) {
      throw new Error(`Widget engine already registered: ${engine.id}`);
    }

    this.engines.set(engine.id, engine);
  }

  get(widgetId: string) {
    return this.engines.get(widgetId) ?? null;
  }

  list() {
    return [...this.engines.values()];
  }

  ids() {
    return [...this.engines.keys()];
  }
}

export const widgetRegistry = new WidgetRegistry([...cryptoWidgets, ...liquidityWidgets, ...derivativesWidgets]);
