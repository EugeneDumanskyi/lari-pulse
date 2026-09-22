import { getWidgetCatalogItem } from "@/lib/widgets/catalog";
import type {
  BuildInsightSectionsInput,
  InsightLine,
  InsightSection,
  InsightSectionCoverage,
  InsightSnapshot
} from "./insights.types";

/**
 * Every sentence Insights returns is composed here, from a template and a
 * stored value. The module is pure — no database, no session, no clock — so
 * the whole template table is testable on fixed rows with exact expected text.
 */

/** Below this a window holds at most one interval, which is not a trend. */
export const minimumSnapshots = 3;
export const maxSnapshotsPerWindow = 5000;
export const maxAlertEventsPerWindow = 500;
export const maxTransitionLines = 20;
export const maxListedLinesPerSection = 6;

const severityRank: Record<string, number> = { info: 0, warning: 1, critical: 2 };

export function joinWithAnd(items: string[]) {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms));

  if (total < 60_000) {
    return "under a minute";
  }

  if (total < 3_600_000) {
    const minutes = Math.floor(total / 60_000);
    return `${minutes} ${plural(minutes, "minute")}`;
  }

  if (total < 86_400_000) {
    const hours = Math.floor(total / 3_600_000);
    const minutes = Math.floor((total % 3_600_000) / 60_000);
    const head = `${hours} ${plural(hours, "hour")}`;

    return minutes === 0 ? head : `${head} ${minutes} ${plural(minutes, "minute")}`;
  }

  const days = Math.floor(total / 86_400_000);
  const hours = Math.floor((total % 86_400_000) / 3_600_000);
  const head = `${days} ${plural(days, "day")}`;

  return hours === 0 ? head : `${head} ${hours} ${plural(hours, "hour")}`;
}

/** `strong_bullish` reads `strong bullish`, matching the overview rules. */
function spaced(value: string) {
  return value.replaceAll("_", " ");
}

function readableWidgetName(widgetId: string) {
  return getWidgetCatalogItem(widgetId)?.title ?? widgetId.replaceAll("_", " ");
}

function snapshotRows(ids: number[]) {
  return ids.length > 0 ? [{ table: "situation_overviews" as const, ids }] : [];
}

function alertRows(ids: number[]) {
  return ids.length > 0 ? [{ table: "alert_events" as const, ids }] : [];
}

function snapshotCoverage(count: number): InsightSectionCoverage {
  if (count === 0) {
    return "empty";
  }

  return count < minimumSnapshots ? "insufficient" : "reported";
}

function shortfallCount(count: number) {
  return `Only ${count} ${plural(count, "snapshot")} ${count === 1 ? "was" : "were"} stored in this window`;
}

/**
 * The one line a snapshot section emits when the window is too thin to report
 * on, so a client never has to infer meaning from an empty `lines` array.
 */
function shortfallLines(
  sectionId: string,
  coverage: InsightSectionCoverage,
  snapshots: InsightSnapshot[],
  subject: { singular: string; plural: string }
): InsightLine[] {
  const ids = snapshots.map((snapshot) => snapshot.id);

  if (coverage === "empty") {
    return [
      {
        id: `${sectionId}-empty`,
        text: `No situation snapshot was stored in this window, so no ${subject.singular} can be reported.`,
        values: { snapshotCount: 0 },
        sourceRows: []
      }
    ];
  }

  return [
    {
      id: `${sectionId}-insufficient`,
      text: `${shortfallCount(snapshots.length)}, fewer than the ${minimumSnapshots} needed to report ${subject.plural}.`,
      values: { snapshotCount: snapshots.length },
      sourceRows: snapshotRows(ids)
    }
  ];
}

function buildWindowCoverage(input: BuildInsightSectionsInput): InsightSection {
  const { snapshots, range } = input;
  const count = snapshots.length;
  const ids = snapshots.map((snapshot) => snapshot.id);
  const lines: InsightLine[] = [];

  lines.push({
    id: "window-snapshots",
    text:
      count === 0
        ? `No situation snapshot was stored in the requested ${range} window.`
        : `${count} situation ${plural(count, "snapshot")} ${count === 1 ? "covers" : "cover"} the requested ${range} window.`,
    values: { snapshotCount: count, range },
    sourceRows: snapshotRows(ids)
  });

  if (count >= 1) {
    const oldest = snapshots[0];
    const newest = snapshots[count - 1];

    lines.push({
      id: "window-span",
      text:
        count === 1
          ? `The only stored snapshot is from ${oldest.generatedAt}.`
          : `The covered span runs ${oldest.generatedAt} to ${newest.generatedAt}, narrower than the requested ${range} window.`,
      values: { from: oldest.generatedAt, to: newest.generatedAt, range },
      sourceRows: snapshotRows(count === 1 ? [oldest.id] : [oldest.id, newest.id])
    });
  }

  if (count >= 2) {
    let gapMs = -1;
    let gapIds: number[] = [];

    for (let index = 1; index < count; index += 1) {
      const previous = snapshots[index - 1];
      const current = snapshots[index];
      const span = Date.parse(current.generatedAt) - Date.parse(previous.generatedAt);

      if (Number.isFinite(span) && span > gapMs) {
        gapMs = span;
        gapIds = [previous.id, current.id];
      }
    }

    if (gapIds.length === 2) {
      lines.push({
        id: "window-gap",
        text: `The largest gap between consecutive snapshots is ${formatDuration(gapMs)}.`,
        values: { gapMs },
        sourceRows: snapshotRows(gapIds)
      });
    }
  }

  if (count === 1 || count === 2) {
    lines.push({
      id: "window-insufficient",
      text: `${shortfallCount(count)}, fewer than the ${minimumSnapshots} this feature needs, so the sections below report the shortage rather than a trend.`,
      values: { snapshotCount: count },
      sourceRows: snapshotRows(ids)
    });
  }

  if (input.snapshotsTruncated) {
    lines.push({
      id: "window-truncated",
      text: `This window held more than ${maxSnapshotsPerWindow} snapshots; the ${maxSnapshotsPerWindow} most recent were read and ${input.snapshotsLeftOut} older ones were left out.`,
      values: { limit: maxSnapshotsPerWindow, leftOut: input.snapshotsLeftOut },
      sourceRows: []
    });
  }

  return {
    id: "window-coverage",
    title: "Window coverage",
    category: "market",
    // The section that states the shortage cannot itself go quiet.
    coverage: "reported",
    lines
  };
}

interface TransitionCopy {
  sectionId: "bias-transitions" | "risk-transitions";
  title: string;
  linePrefix: "bias" | "risk";
  subject: { singular: string; plural: string };
  moved: string;
  held: string;
  changed: string;
}

function buildTransitions(
  input: BuildInsightSectionsInput,
  copy: TransitionCopy,
  valueOf: (snapshot: InsightSnapshot) => string
): InsightSection {
  const { snapshots } = input;
  const coverage = snapshotCoverage(snapshots.length);

  if (coverage !== "reported") {
    return {
      id: copy.sectionId,
      title: copy.title,
      category: "market",
      coverage,
      lines: shortfallLines(copy.linePrefix, coverage, snapshots, copy.subject)
    };
  }

  const transitions: InsightLine[] = [];

  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1];
    const current = snapshots[index];
    const previousValue = valueOf(previous);
    const currentValue = valueOf(current);

    if (previousValue === currentValue) {
      continue;
    }

    const gapMs = Date.parse(current.generatedAt) - Date.parse(previous.generatedAt);

    transitions.push({
      id: `${copy.linePrefix}-transition-${previous.id}-${current.id}`,
      text: `${copy.moved} moved from ${spaced(previousValue)} to ${spaced(currentValue)} at ${current.generatedAt}, ${formatDuration(gapMs)} after the previous snapshot.`,
      values: { previous: previousValue, current: currentValue, at: current.generatedAt, gapMs },
      sourceRows: snapshotRows([previous.id, current.id])
    });
  }

  if (transitions.length === 0) {
    const value = valueOf(snapshots[0]);

    return {
      id: copy.sectionId,
      title: copy.title,
      category: "market",
      coverage,
      lines: [
        {
          id: `${copy.linePrefix}-steady`,
          text: `${copy.held} held at ${spaced(value)} across all ${snapshots.length} snapshots.`,
          values: { value, snapshotCount: snapshots.length },
          sourceRows: snapshotRows(snapshots.map((snapshot) => snapshot.id))
        }
      ]
    };
  }

  // The cap keeps the most recent transitions and still renders them
  // oldest-first among those kept.
  const kept = transitions.slice(-maxTransitionLines);
  const lines = [...kept];

  if (transitions.length > maxTransitionLines) {
    const leftOut = transitions.length - maxTransitionLines;

    lines.push({
      id: `${copy.linePrefix}-truncated`,
      text: `${copy.changed} changed ${transitions.length} times in this window; the ${maxTransitionLines} most recent are listed and ${leftOut} earlier ones were left out.`,
      values: { transitionCount: transitions.length, listed: maxTransitionLines, leftOut },
      sourceRows: []
    });
  }

  return {
    id: copy.sectionId,
    title: copy.title,
    category: "market",
    coverage,
    lines
  };
}

interface DriverGroup {
  key: string;
  sourceWidget: string | undefined;
  label: string;
  count: number;
  firstDirection: string;
  lastDirection: string;
  mostRecentAt: string;
  ids: number[];
}

function groupDrivers(snapshots: InsightSnapshot[], pick: (snapshot: InsightSnapshot) => InsightSnapshot["mainDrivers"]) {
  const groups = new Map<string, DriverGroup>();

  for (const snapshot of snapshots) {
    const seen = new Set<string>();

    for (const driver of pick(snapshot)) {
      const key = driver.sourceWidget ?? driver.id;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      const existing = groups.get(key);

      if (!existing) {
        groups.set(key, {
          key,
          sourceWidget: driver.sourceWidget,
          label: driver.label,
          count: 1,
          firstDirection: driver.direction,
          lastDirection: driver.direction,
          mostRecentAt: snapshot.generatedAt,
          ids: [snapshot.id]
        });
        continue;
      }

      existing.count += 1;
      // The newest label is the one that matches the current catalog.
      existing.label = driver.label;
      existing.lastDirection = driver.direction;
      existing.mostRecentAt = snapshot.generatedAt;
      existing.ids.push(snapshot.id);
    }
  }

  return [...groups.values()];
}

function compareDriverGroups(left: DriverGroup, right: DriverGroup) {
  return (
    right.count - left.count ||
    right.mostRecentAt.localeCompare(left.mostRecentAt) ||
    left.key.localeCompare(right.key)
  );
}

function directionClause(group: DriverGroup) {
  return group.firstDirection === group.lastDirection
    ? `holding ${spaced(group.lastDirection)}`
    : `moving from ${spaced(group.firstDirection)} to ${spaced(group.lastDirection)}`;
}

interface GroupedCopy {
  sectionId: "recurring-drivers" | "persistent-conflicts";
  title: string;
  linePrefix: "driver" | "conflict";
  shortfallPrefix: "drivers" | "conflicts";
  subject: { singular: string; plural: string };
  statement: string;
  none: string;
  noRecurrence: string;
  truncated: (total: number, leftOut: number) => string;
}

function buildGrouped(
  input: BuildInsightSectionsInput,
  copy: GroupedCopy,
  pick: (snapshot: InsightSnapshot) => InsightSnapshot["mainDrivers"]
): InsightSection {
  const { snapshots } = input;
  const coverage = snapshotCoverage(snapshots.length);

  if (coverage !== "reported") {
    return {
      id: copy.sectionId,
      title: copy.title,
      category: "market",
      coverage,
      lines: shortfallLines(copy.shortfallPrefix, coverage, snapshots, copy.subject)
    };
  }

  const groups = groupDrivers(snapshots, pick);
  const section = { id: copy.sectionId, title: copy.title, category: "market" as const, coverage };

  if (groups.length === 0) {
    return {
      ...section,
      lines: [{ id: `${copy.shortfallPrefix}-none`, text: copy.none, values: {}, sourceRows: [] }]
    };
  }

  // One appearance is not a recurrence.
  const qualifying = groups.filter((group) => group.count >= 2).sort(compareDriverGroups);

  if (qualifying.length === 0) {
    return {
      ...section,
      lines: [{ id: `${copy.shortfallPrefix}-no-recurrence`, text: copy.noRecurrence, values: {}, sourceRows: [] }]
    };
  }

  const listed = qualifying.slice(0, maxListedLinesPerSection);
  const lines: InsightLine[] = listed.map((group) => ({
    id: `${copy.linePrefix}-${group.key}`,
    text: `${group.label} ${copy.statement} in ${group.count} of ${snapshots.length} snapshots, ${directionClause(group)}.`,
    values: {
      // The group key stands in when a driver carried no source widget.
      sourceWidget: group.sourceWidget ?? group.key,
      label: group.label,
      count: group.count,
      snapshotCount: snapshots.length,
      firstDirection: group.firstDirection,
      lastDirection: group.lastDirection,
      mostRecentAt: group.mostRecentAt
    },
    sourceRows: snapshotRows([...group.ids].sort((left, right) => left - right))
  }));

  if (qualifying.length > maxListedLinesPerSection) {
    const leftOut = qualifying.length - maxListedLinesPerSection;

    lines.push({
      id: `${copy.shortfallPrefix}-truncated`,
      text: copy.truncated(qualifying.length, leftOut),
      values: { groupCount: qualifying.length, listed: maxListedLinesPerSection, leftOut },
      sourceRows: []
    });
  }

  return { ...section, lines };
}

interface WatchGroup {
  conditionId: string;
  label: string;
  condition: string;
  severity: string;
  count: number;
  mostRecentAt: string;
  ids: number[];
}

function buildWatchConditions(input: BuildInsightSectionsInput): InsightSection {
  const { snapshots } = input;
  const coverage = snapshotCoverage(snapshots.length);
  const section = { id: "watch-conditions" as const, title: "Watch conditions", category: "market" as const };

  if (coverage !== "reported") {
    return {
      ...section,
      coverage,
      lines: shortfallLines("watch", coverage, snapshots, { singular: "watch condition", plural: "watch conditions" })
    };
  }

  const groups = new Map<string, WatchGroup>();

  for (const snapshot of snapshots) {
    const seen = new Set<string>();

    for (const condition of snapshot.watchConditions) {
      // Two conditions from the same widget are two different statements, so
      // the condition id is the grouping key and `sourceWidget` is not.
      if (seen.has(condition.id)) {
        continue;
      }

      seen.add(condition.id);
      const existing = groups.get(condition.id);

      if (!existing) {
        groups.set(condition.id, {
          conditionId: condition.id,
          label: condition.label,
          condition: condition.condition,
          severity: condition.severity,
          count: 1,
          mostRecentAt: snapshot.generatedAt,
          ids: [snapshot.id]
        });
        continue;
      }

      existing.count += 1;
      existing.label = condition.label;
      existing.condition = condition.condition;
      existing.mostRecentAt = snapshot.generatedAt;
      existing.ids.push(snapshot.id);

      if ((severityRank[condition.severity] ?? 0) > (severityRank[existing.severity] ?? 0)) {
        existing.severity = condition.severity;
      }
    }
  }

  const listedGroups = [...groups.values()].sort(
    (left, right) =>
      (severityRank[right.severity] ?? 0) - (severityRank[left.severity] ?? 0) ||
      right.count - left.count ||
      right.mostRecentAt.localeCompare(left.mostRecentAt) ||
      left.conditionId.localeCompare(right.conditionId)
  );

  if (listedGroups.length === 0) {
    return {
      ...section,
      coverage,
      lines: [
        { id: "watch-none", text: "No watch condition was raised in this window.", values: {}, sourceRows: [] }
      ]
    };
  }

  const lines: InsightLine[] = listedGroups.slice(0, maxListedLinesPerSection).map((group) => ({
    id: `watch-${group.conditionId}`,
    text: `${group.label} was raised in ${group.count} of ${snapshots.length} snapshots at ${group.severity} severity, most recently at ${group.mostRecentAt}.`,
    values: {
      conditionId: group.conditionId,
      label: group.label,
      severity: group.severity,
      condition: group.condition,
      count: group.count,
      snapshotCount: snapshots.length,
      mostRecentAt: group.mostRecentAt
    },
    sourceRows: snapshotRows([...group.ids].sort((left, right) => left - right))
  }));

  if (listedGroups.length > maxListedLinesPerSection) {
    const leftOut = listedGroups.length - maxListedLinesPerSection;

    lines.push({
      id: "watch-truncated",
      text: `${listedGroups.length} watch conditions were raised; the ${maxListedLinesPerSection} most significant are listed and ${leftOut} others were left out.`,
      values: { groupCount: listedGroups.length, listed: maxListedLinesPerSection, leftOut },
      sourceRows: []
    });
  }

  return { ...section, coverage, lines };
}

function widgetNameList(snapshots: InsightSnapshot[], pick: (snapshot: InsightSnapshot) => string[]) {
  const counts = new Map<string, number>();

  for (const snapshot of snapshots) {
    for (const widgetId of new Set(pick(snapshot))) {
      counts.set(widgetId, (counts.get(widgetId) ?? 0) + 1);
    }
  }

  const ordered = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([widgetId]) => readableWidgetName(widgetId));

  if (ordered.length <= maxListedLinesPerSection) {
    return joinWithAnd(ordered);
  }

  const leftOut = ordered.length - maxListedLinesPerSection;

  return joinWithAnd([...ordered.slice(0, maxListedLinesPerSection), `${leftOut} others`]);
}

function buildDataCoverage(input: BuildInsightSectionsInput): InsightSection {
  const { snapshots } = input;
  const coverage = snapshotCoverage(snapshots.length);
  const section = { id: "data-coverage" as const, title: "Data coverage", category: "market" as const };

  if (coverage !== "reported") {
    return {
      ...section,
      coverage,
      lines: shortfallLines("coverage", coverage, snapshots, { singular: "data coverage", plural: "data coverage" })
    };
  }

  const total = snapshots.length;
  const partial = snapshots.filter((snapshot) => snapshot.meta.isPartial);
  const stale = snapshots.filter((snapshot) => snapshot.meta.staleInputs.length > 0);
  const missing = snapshots.filter((snapshot) => snapshot.meta.missingInputs.length > 0);
  const lines: InsightLine[] = [
    {
      id: "coverage-partial",
      text:
        partial.length === 0
          ? "Every snapshot in this window was built from the full expected input set."
          : `${partial.length} of ${total} snapshots ${partial.length === 1 ? "was" : "were"} partial, built without every expected input.`,
      values: { partialCount: partial.length, snapshotCount: total },
      sourceRows: snapshotRows(partial.map((snapshot) => snapshot.id))
    },
    {
      id: "coverage-stale",
      text:
        stale.length === 0
          ? "No snapshot reported a stale input."
          : `Stale inputs appeared in ${stale.length} of ${total} snapshots: ${widgetNameList(stale, (snapshot) => snapshot.meta.staleInputs)}.`,
      values: { staleCount: stale.length, snapshotCount: total },
      sourceRows: snapshotRows(stale.map((snapshot) => snapshot.id))
    },
    {
      id: "coverage-missing",
      text:
        missing.length === 0
          ? "No snapshot reported a missing input."
          : `Missing inputs appeared in ${missing.length} of ${total} snapshots: ${widgetNameList(missing, (snapshot) => snapshot.meta.missingInputs)}.`,
      values: { missingCount: missing.length, snapshotCount: total },
      sourceRows: snapshotRows(missing.map((snapshot) => snapshot.id))
    }
  ];

  const confidenceCounts = new Map<string, number>();

  for (const snapshot of snapshots) {
    confidenceCounts.set(snapshot.confidence, (confidenceCounts.get(snapshot.confidence) ?? 0) + 1);
  }

  let confidenceText: string;

  if (confidenceCounts.size === 1) {
    const [value] = [...confidenceCounts.keys()];
    confidenceText = `Confidence was ${value} in all ${total} snapshots.`;
  } else {
    // A fixed reading order, so the line does not reshuffle between requests.
    const fixedOrder = ["high", "medium", "low"];
    const extras = [...confidenceCounts.keys()].filter((value) => !fixedOrder.includes(value)).sort();
    const parts = [...fixedOrder, ...extras]
      .filter((value) => (confidenceCounts.get(value) ?? 0) > 0)
      .map((value, index) => {
        const count = confidenceCounts.get(value) ?? 0;

        // Only the leading item carries the noun, and it pluralises.
        return index === 0 ? `${value} in ${count} ${plural(count, "snapshot")}` : `${value} in ${count}`;
      });

    confidenceText = `Confidence was ${joinWithAnd(parts)}.`;
  }

  lines.push({
    id: "coverage-confidence",
    text: confidenceText,
    values: {
      high: confidenceCounts.get("high") ?? 0,
      medium: confidenceCounts.get("medium") ?? 0,
      low: confidenceCounts.get("low") ?? 0,
      snapshotCount: total
    },
    sourceRows: snapshotRows(snapshots.map((snapshot) => snapshot.id))
  });

  return { ...section, coverage, lines };
}

interface AlertGroup {
  title: string;
  severity: string;
  count: number;
  mostRecentAt: string;
  ids: number[];
}

function buildAlertActivity(input: BuildInsightSectionsInput): InsightSection {
  const section = { id: "alert-activity" as const, title: "Alert activity", category: "personal" as const };
  const alerts = input.alerts;

  if (alerts === null) {
    return {
      ...section,
      coverage: "omitted",
      lines: [
        {
          id: "alerts-omitted",
          // One template covers "not signed in" and "role too low" on purpose.
          text: "Alert activity is personal to a signed-in account with the analyst role, so it is not included in this response.",
          values: {},
          sourceRows: []
        }
      ]
    };
  }

  if (alerts.length === 0) {
    return {
      ...section,
      coverage: "empty",
      lines: [
        {
          id: "alerts-none",
          text: "No alert event was raised for your account in this window.",
          values: {},
          sourceRows: []
        }
      ]
    };
  }

  const groups = new Map<string, AlertGroup>();

  for (const event of alerts) {
    const key = `${event.title}\u0000${event.severity}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        title: event.title,
        severity: event.severity,
        count: 1,
        mostRecentAt: event.createdAt,
        ids: [event.id]
      });
      continue;
    }

    existing.count += 1;
    existing.ids.push(event.id);

    if (event.createdAt > existing.mostRecentAt) {
      existing.mostRecentAt = event.createdAt;
    }
  }

  const ordered = [...groups.values()].sort(
    (left, right) =>
      (severityRank[right.severity] ?? 0) - (severityRank[left.severity] ?? 0) ||
      right.count - left.count ||
      right.mostRecentAt.localeCompare(left.mostRecentAt) ||
      left.title.localeCompare(right.title)
  );
  const allIds = alerts.map((event) => event.id).sort((left, right) => left - right);
  const lines: InsightLine[] = [
    {
      id: "alerts-count",
      text: `${alerts.length} alert ${plural(alerts.length, "event")} ${alerts.length === 1 ? "was" : "were"} raised for your account in this window.`,
      values: { alertCount: alerts.length },
      sourceRows: alertRows(allIds)
    }
  ];

  ordered.slice(0, maxListedLinesPerSection).forEach((group, index) => {
    lines.push({
      // `alert_events.title` is free text and is not safe in an identifier.
      id: `alert-group-${index}`,
      text:
        group.count === 1
          ? `${group.title} fired once at ${group.severity} severity, at ${group.mostRecentAt}.`
          : `${group.title} fired ${group.count} times at ${group.severity} severity, most recently at ${group.mostRecentAt}.`,
      values: {
        title: group.title,
        severity: group.severity,
        count: group.count,
        mostRecentAt: group.mostRecentAt
      },
      sourceRows: alertRows([...group.ids].sort((left, right) => left - right))
    });
  });

  if (ordered.length > maxListedLinesPerSection) {
    const leftOut = ordered.length - maxListedLinesPerSection;

    lines.push({
      id: "alerts-groups-truncated",
      text: `${ordered.length} alert titles fired in this window; the ${maxListedLinesPerSection} most significant are listed and ${leftOut} others were left out.`,
      values: { groupCount: ordered.length, listed: maxListedLinesPerSection, leftOut },
      sourceRows: []
    });
  }

  const unacknowledged = alerts.filter((event) => !event.acknowledged);

  lines.push({
    id: "alerts-unacknowledged",
    text:
      unacknowledged.length === 0
        ? "All of those events were acknowledged."
        : `${unacknowledged.length} of those events ${unacknowledged.length === 1 ? "is" : "are"} still unacknowledged.`,
    values: { unacknowledgedCount: unacknowledged.length, alertCount: alerts.length },
    sourceRows: alertRows(unacknowledged.map((event) => event.id).sort((left, right) => left - right))
  });

  if (input.alertsTruncated) {
    lines.push({
      id: "alerts-truncated",
      text: `This window held more than ${maxAlertEventsPerWindow} alert events; the ${maxAlertEventsPerWindow} most recent were read and ${input.alertsLeftOut} older ones were left out.`,
      values: { limit: maxAlertEventsPerWindow, leftOut: input.alertsLeftOut },
      sourceRows: []
    });
  }

  return { ...section, coverage: "reported", lines };
}

/** Rows in, sections out. All eight are always emitted, in this fixed order. */
export function buildInsightSections(input: BuildInsightSectionsInput): InsightSection[] {
  return [
    buildWindowCoverage(input),
    buildTransitions(
      input,
      {
        sectionId: "bias-transitions",
        title: "Bias transitions",
        linePrefix: "bias",
        subject: { singular: "bias transition", plural: "bias transitions" },
        moved: "Bias",
        held: "Bias",
        changed: "Bias"
      },
      (snapshot) => snapshot.bias
    ),
    buildTransitions(
      input,
      {
        sectionId: "risk-transitions",
        title: "Risk transitions",
        linePrefix: "risk",
        subject: { singular: "risk level transition", plural: "risk level transitions" },
        moved: "Risk level",
        held: "Risk level",
        changed: "Risk level"
      },
      (snapshot) => snapshot.riskLevel
    ),
    buildGrouped(
      input,
      {
        sectionId: "recurring-drivers",
        title: "Recurring drivers",
        linePrefix: "driver",
        shortfallPrefix: "drivers",
        subject: { singular: "recurring driver", plural: "recurring drivers" },
        statement: "was a main driver",
        none: "No snapshot in this window recorded a main driver.",
        noRecurrence: "No widget was a main driver in more than one snapshot.",
        truncated: (total, leftOut) =>
          `${total} widgets recurred as main drivers; the ${maxListedLinesPerSection} most frequent are listed and ${leftOut} others were left out.`
      },
      (snapshot) => snapshot.mainDrivers
    ),
    buildGrouped(
      input,
      {
        sectionId: "persistent-conflicts",
        title: "Persistent conflicts",
        linePrefix: "conflict",
        shortfallPrefix: "conflicts",
        subject: { singular: "persistent conflict", plural: "persistent conflicts" },
        statement: "conflicted with the overall bias",
        none: "No snapshot in this window recorded a conflicting signal.",
        noRecurrence: "No widget conflicted with the overall bias in more than one snapshot.",
        truncated: (total, leftOut) =>
          `${total} widgets conflicted more than once; the ${maxListedLinesPerSection} most frequent are listed and ${leftOut} others were left out.`
      },
      (snapshot) => snapshot.conflictingSignals
    ),
    buildWatchConditions(input),
    buildDataCoverage(input),
    buildAlertActivity(input)
  ];
}
