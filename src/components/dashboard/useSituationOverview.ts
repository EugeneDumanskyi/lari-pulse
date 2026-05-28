"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiEnvelope, SituationOverview } from "@/lib/api/types";

type SituationOverviewStatus = "idle" | "loading" | "ready" | "error";

interface UseSituationOverviewOptions {
  symbol: string;
  timeframe: string;
  refreshKey?: number;
  enabled?: boolean;
}

async function fetchSituationOverview(symbol: string, timeframe: string, signal?: AbortSignal) {
  const response = await fetch(
    `/api/overview/situation?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
    { signal }
  );
  const body = (await response.json()) as ApiEnvelope<SituationOverview> | { status: "error"; message: string };

  if (!response.ok || body.status === "error") {
    throw new Error("message" in body ? body.message : "Unable to load situation overview");
  }

  return body.data;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useSituationOverview({
  symbol,
  timeframe,
  refreshKey = 0,
  enabled = true
}: UseSituationOverviewOptions) {
  const [overview, setOverview] = useState<SituationOverview | null>(null);
  const [status, setStatus] = useState<SituationOverviewStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setLocalRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !symbol || !timeframe) {
      return;
    }

    const controller = new AbortController();

    async function loadOverview() {
      setStatus("loading");
      setError(null);

      try {
        const data = await fetchSituationOverview(symbol, timeframe, controller.signal);
        setOverview(data);
        setStatus("ready");
      } catch (loadError) {
        if (!controller.signal.aborted && !isAbortError(loadError)) {
          setStatus("error");
          setError(loadError instanceof Error ? loadError.message : "Unable to load situation overview");
        }
      }
    }

    void loadOverview();

    return () => controller.abort();
  }, [enabled, localRefreshKey, refreshKey, symbol, timeframe]);

  return {
    overview,
    status,
    error,
    refresh
  };
}

