import type Database from "better-sqlite3";
import type {
  DerivativesLatestMetrics,
  DerivativesMetricRecord,
  NewDerivativesMetric
} from "../types";

interface DerivativesMetricRow {
  id: number;
  symbol: string;
  period: string;
  source: string;
  metric_time: number;
  funding_rate: number | null;
  next_funding_time: number | null;
  mark_price: number | null;
  index_price: number | null;
  open_interest: number | null;
  open_interest_value: number | null;
  long_short_ratio: number | null;
  long_account: number | null;
  short_account: number | null;
  basis: number | null;
  basis_rate: number | null;
  annualized_basis_rate: number | null;
  futures_price: number | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

function mapDerivativesMetric(row: DerivativesMetricRow): DerivativesMetricRecord {
  return {
    id: row.id,
    symbol: row.symbol,
    period: row.period,
    source: row.source,
    metricTime: row.metric_time,
    fundingRate: row.funding_rate,
    nextFundingTime: row.next_funding_time,
    markPrice: row.mark_price,
    indexPrice: row.index_price,
    openInterest: row.open_interest,
    openInterestValue: row.open_interest_value,
    longShortRatio: row.long_short_ratio,
    longAccount: row.long_account,
    shortAccount: row.short_account,
    basis: row.basis,
    basisRate: row.basis_rate,
    annualizedBasisRate: row.annualized_basis_rate,
    futuresPrice: row.futures_price,
    metadataJson: row.metadata_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function latestNumber(rows: DerivativesMetricRecord[], key: keyof DerivativesMetricRecord) {
  const row = rows.find((item) => typeof item[key] === "number");
  const value = row?.[key];

  return typeof value === "number" ? value : null;
}

function latestTime(rows: DerivativesMetricRecord[], key: keyof DerivativesMetricRecord) {
  const row = rows.find((item) => typeof item[key] === "number");
  const value = row?.[key];

  return typeof value === "number" ? value : null;
}

export function upsertDerivativesMetrics(db: Database.Database, metrics: NewDerivativesMetric[]) {
  const statement = db.prepare(`
    INSERT INTO derivatives_metrics (
      symbol,
      period,
      source,
      metric_time,
      funding_rate,
      next_funding_time,
      mark_price,
      index_price,
      open_interest,
      open_interest_value,
      long_short_ratio,
      long_account,
      short_account,
      basis,
      basis_rate,
      annualized_basis_rate,
      futures_price,
      metadata_json
    )
    VALUES (
      @symbol,
      @period,
      @source,
      @metricTime,
      @fundingRate,
      @nextFundingTime,
      @markPrice,
      @indexPrice,
      @openInterest,
      @openInterestValue,
      @longShortRatio,
      @longAccount,
      @shortAccount,
      @basis,
      @basisRate,
      @annualizedBasisRate,
      @futuresPrice,
      @metadataJson
    )
    ON CONFLICT(symbol, period, source, metric_time) DO UPDATE SET
      funding_rate = COALESCE(excluded.funding_rate, derivatives_metrics.funding_rate),
      next_funding_time = COALESCE(excluded.next_funding_time, derivatives_metrics.next_funding_time),
      mark_price = COALESCE(excluded.mark_price, derivatives_metrics.mark_price),
      index_price = COALESCE(excluded.index_price, derivatives_metrics.index_price),
      open_interest = COALESCE(excluded.open_interest, derivatives_metrics.open_interest),
      open_interest_value = COALESCE(excluded.open_interest_value, derivatives_metrics.open_interest_value),
      long_short_ratio = COALESCE(excluded.long_short_ratio, derivatives_metrics.long_short_ratio),
      long_account = COALESCE(excluded.long_account, derivatives_metrics.long_account),
      short_account = COALESCE(excluded.short_account, derivatives_metrics.short_account),
      basis = COALESCE(excluded.basis, derivatives_metrics.basis),
      basis_rate = COALESCE(excluded.basis_rate, derivatives_metrics.basis_rate),
      annualized_basis_rate = COALESCE(excluded.annualized_basis_rate, derivatives_metrics.annualized_basis_rate),
      futures_price = COALESCE(excluded.futures_price, derivatives_metrics.futures_price),
      metadata_json = COALESCE(excluded.metadata_json, derivatives_metrics.metadata_json),
      updated_at = datetime('now')
  `);

  const upsertMany = db.transaction((items: NewDerivativesMetric[]) => {
    let changed = 0;

    for (const item of items) {
      changed += statement.run({
        ...item,
        fundingRate: item.fundingRate ?? null,
        nextFundingTime: item.nextFundingTime ?? null,
        markPrice: item.markPrice ?? null,
        indexPrice: item.indexPrice ?? null,
        openInterest: item.openInterest ?? null,
        openInterestValue: item.openInterestValue ?? null,
        longShortRatio: item.longShortRatio ?? null,
        longAccount: item.longAccount ?? null,
        shortAccount: item.shortAccount ?? null,
        basis: item.basis ?? null,
        basisRate: item.basisRate ?? null,
        annualizedBasisRate: item.annualizedBasisRate ?? null,
        futuresPrice: item.futuresPrice ?? null,
        metadataJson: item.metadataJson ?? null
      }).changes;
    }

    return changed;
  });

  return upsertMany(metrics);
}

export function listDerivativesMetrics(
  db: Database.Database,
  filters: { symbol: string; period: string; source?: string; limit?: number }
) {
  const conditions = ["symbol = @symbol", "period = @period"];
  const params: Record<string, string | number> = {
    symbol: filters.symbol,
    period: filters.period,
    limit: filters.limit ?? 100
  };

  if (filters.source) {
    conditions.push("source = @source");
    params.source = filters.source;
  }

  const rows = db
    .prepare(
      `
      SELECT *
      FROM derivatives_metrics
      WHERE ${conditions.join(" AND ")}
      ORDER BY metric_time DESC
      LIMIT @limit
    `
    )
    .all(params) as DerivativesMetricRow[];

  return rows.map(mapDerivativesMetric);
}

export function getLatestDerivativesMetrics(
  db: Database.Database,
  filters: { symbol: string; period: string; source?: string; limit?: number }
): DerivativesLatestMetrics | null {
  const rows = listDerivativesMetrics(db, filters);

  if (rows.length === 0) {
    return null;
  }

  const openInterestValueRows = rows
    .filter((row) => typeof row.openInterestValue === "number")
    .sort((left, right) => left.metricTime - right.metricTime);
  const openInterestQuantityRows = rows
    .filter((row) => typeof row.openInterest === "number")
    .sort((left, right) => left.metricTime - right.metricTime);
  const changeRows = openInterestValueRows.length >= 2 ? openInterestValueRows : openInterestQuantityRows;
  const firstOpenInterest =
    openInterestValueRows.length >= 2 ? changeRows[0]?.openInterestValue : changeRows[0]?.openInterest;
  const lastOpenInterest =
    openInterestValueRows.length >= 2 ? changeRows.at(-1)?.openInterestValue : changeRows.at(-1)?.openInterest;
  const openInterestChangePct =
    firstOpenInterest && lastOpenInterest
      ? ((lastOpenInterest - firstOpenInterest) / Math.abs(firstOpenInterest)) * 100
      : null;
  const latestTimeMs = Math.max(...rows.map((row) => row.metricTime));

  return {
    symbol: filters.symbol,
    period: filters.period,
    source: filters.source ?? rows[0].source,
    updatedAt: Number.isFinite(latestTimeMs) ? new Date(latestTimeMs).toISOString() : null,
    fundingRate: latestNumber(rows, "fundingRate"),
    nextFundingTime: latestTime(rows, "nextFundingTime"),
    markPrice: latestNumber(rows, "markPrice"),
    indexPrice: latestNumber(rows, "indexPrice"),
    openInterest: latestNumber(rows, "openInterest"),
    openInterestValue: latestNumber(rows, "openInterestValue"),
    openInterestChangePct,
    longShortRatio: latestNumber(rows, "longShortRatio"),
    longAccount: latestNumber(rows, "longAccount"),
    shortAccount: latestNumber(rows, "shortAccount"),
    basis: latestNumber(rows, "basis"),
    basisRate: latestNumber(rows, "basisRate"),
    annualizedBasisRate: latestNumber(rows, "annualizedBasisRate"),
    futuresPrice: latestNumber(rows, "futuresPrice"),
    sampleCount: rows.length
  };
}
