import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SituationDriver, SituationWatchCondition } from "@/lib/services/situationOverview/situationOverview.types";
import {
  buildInsightSections,
  formatDuration,
  joinWithAnd,
  maxListedLinesPerSection,
  maxTransitionLines,
  minimumSnapshots
} from "./insights.rules";
import type {
  BuildInsightSectionsInput,
  InsightAlertEvent,
  InsightSection,
  InsightSectionId,
  InsightSnapshot
} from "./insights.types";

const base = Date.parse("2026-09-14T08:00:00.000Z");
const hour = 3_600_000;

function at(offsetMs: number) {
  return new Date(base + offsetMs).toISOString();
}

function snapshot(id: number, offsetMs: number, overrides: Partial<InsightSnapshot> = {}): InsightSnapshot {
  return {
    id,
    generatedAt: at(offsetMs),
    bias: "bullish",
    riskLevel: "moderate",
    confidence: "medium",
    mainDrivers: [],
    conflictingSignals: [],
    watchConditions: [],
    meta: { missingInputs: [], staleInputs: [], usedFallbacks: [], isPartial: false },
    ...overrides
  };
}

function series(count: number, overridesFor: (index: number) => Partial<InsightSnapshot> = () => ({})) {
  return Array.from({ length: count }, (_unused, index) => snapshot(100 + index, index * hour, overridesFor(index)));
}

function driver(id: string, label: string, direction: SituationDriver["direction"], sourceWidget?: string): SituationDriver {
  return { id, label, direction, strength: "medium", explanation: "Stored explanation.", sourceWidget };
}

function watch(
  id: string,
  label: string,
  severity: SituationWatchCondition["severity"],
  sourceWidget?: string
): SituationWatchCondition {
  return { id, label, condition: `${label} condition text`, implication: "Stored implication.", severity, sourceWidget };
}

function alertEvent(id: number, offsetMs: number, overrides: Partial<InsightAlertEvent> = {}): InsightAlertEvent {
  return {
    id,
    createdAt: at(offsetMs),
    severity: "warning",
    title: "Situation bias changed",
    symbol: "BTCUSDT",
    timeframe: "1h",
    acknowledged: true,
    ...overrides
  };
}

function buildInput(overrides: Partial<BuildInsightSectionsInput> = {}) {
  return buildInsightSections({
    range: "7d",
    requestedWindow: { from: at(-7 * 24 * hour), to: at(24 * hour) },
    snapshots: [],
    snapshotsTruncated: false,
    snapshotsLeftOut: 0,
    alerts: null,
    alertsTruncated: false,
    alertsLeftOut: 0,
    ...overrides
  });
}

function section(sections: InsightSection[], id: InsightSectionId) {
  const found = sections.find((entry) => entry.id === id);
  assert.ok(found, `missing section ${id}`);
  return found;
}

function line(sections: InsightSection[], sectionId: InsightSectionId, lineId: string) {
  const found = section(sections, sectionId).lines.find((entry) => entry.id === lineId);
  assert.ok(found, `missing line ${lineId} in ${sectionId}`);
  return found;
}

function texts(sections: InsightSection[], sectionId: InsightSectionId) {
  return section(sections, sectionId).lines.map((entry) => entry.text);
}

const sectionOrder: InsightSectionId[] = [
  "window-coverage",
  "bias-transitions",
  "risk-transitions",
  "recurring-drivers",
  "persistent-conflicts",
  "watch-conditions",
  "data-coverage",
  "alert-activity"
];

const snapshotSections: InsightSectionId[] = sectionOrder.slice(1, 7);

describe("insight text helpers", () => {
  it("joins zero to three items", () => {
    assert.equal(joinWithAnd([]), "");
    assert.equal(joinWithAnd(["a"]), "a");
    assert.equal(joinWithAnd(["a", "b"]), "a and b");
    assert.equal(joinWithAnd(["a", "b", "c"]), "a, b and c");
  });

  it("formats every duration boundary", () => {
    assert.equal(formatDuration(59_000), "under a minute");
    assert.equal(formatDuration(60_000), "1 minute");
    assert.equal(formatDuration(59 * 60_000), "59 minutes");
    assert.equal(formatDuration(60 * 60_000), "1 hour");
    assert.equal(formatDuration(3_660_000), "1 hour 1 minute");
    assert.equal(formatDuration(23 * hour + 59 * 60_000), "23 hours 59 minutes");
    assert.equal(formatDuration(24 * hour), "1 day");
    assert.equal(formatDuration(2 * 24 * hour + 3 * hour), "2 days 3 hours");
  });
});

describe("insight sections", () => {
  it("always emits the eight sections at their fixed index", () => {
    for (const count of [0, 1, 2, 3, 14]) {
      const sections = buildInput({ snapshots: series(count) });
      assert.deepEqual(sections.map((entry) => entry.id), sectionOrder);
    }
  });

  it("reports the window at zero snapshots and marks the six snapshot sections empty", () => {
    const sections = buildInput({ snapshots: [] });

    assert.equal(section(sections, "window-coverage").coverage, "reported");
    assert.deepEqual(texts(sections, "window-coverage"), [
      "No situation snapshot was stored in the requested 7d window."
    ]);
    assert.deepEqual(line(sections, "window-coverage", "window-snapshots").sourceRows, []);

    for (const id of snapshotSections) {
      assert.equal(section(sections, id).coverage, "empty");
    }

    assert.deepEqual(texts(sections, "bias-transitions"), [
      "No situation snapshot was stored in this window, so no bias transition can be reported."
    ]);
    assert.deepEqual(texts(sections, "risk-transitions"), [
      "No situation snapshot was stored in this window, so no risk level transition can be reported."
    ]);
    assert.deepEqual(texts(sections, "recurring-drivers"), [
      "No situation snapshot was stored in this window, so no recurring driver can be reported."
    ]);
    assert.deepEqual(texts(sections, "persistent-conflicts"), [
      "No situation snapshot was stored in this window, so no persistent conflict can be reported."
    ]);
    assert.deepEqual(texts(sections, "watch-conditions"), [
      "No situation snapshot was stored in this window, so no watch condition can be reported."
    ]);
    assert.deepEqual(texts(sections, "data-coverage"), [
      "No situation snapshot was stored in this window, so no data coverage can be reported."
    ]);
  });

  it("names the count at one snapshot", () => {
    const sections = buildInput({ snapshots: series(1) });

    assert.deepEqual(texts(sections, "window-coverage"), [
      "1 situation snapshot covers the requested 7d window.",
      "The only stored snapshot is from 2026-09-14T08:00:00.000Z.",
      "Only 1 snapshot was stored in this window, fewer than the 3 this feature needs, so the sections below report the shortage rather than a trend."
    ]);
    assert.deepEqual(line(sections, "window-coverage", "window-span").sourceRows, [
      { table: "situation_overviews", ids: [100] }
    ]);

    for (const id of snapshotSections) {
      assert.equal(section(sections, id).coverage, "insufficient");
    }

    assert.deepEqual(texts(sections, "bias-transitions"), [
      "Only 1 snapshot was stored in this window, fewer than the 3 needed to report bias transitions."
    ]);
    assert.deepEqual(texts(sections, "data-coverage"), [
      "Only 1 snapshot was stored in this window, fewer than the 3 needed to report data coverage."
    ]);
    assert.deepEqual(line(sections, "bias-transitions", "bias-insufficient").sourceRows, [
      { table: "situation_overviews", ids: [100] }
    ]);
  });

  it("names the count at two snapshots and reports the gap", () => {
    const sections = buildInput({ snapshots: series(2) });

    assert.deepEqual(texts(sections, "window-coverage"), [
      "2 situation snapshots cover the requested 7d window.",
      "The covered span runs 2026-09-14T08:00:00.000Z to 2026-09-14T09:00:00.000Z, narrower than the requested 7d window.",
      "The largest gap between consecutive snapshots is 1 hour.",
      "Only 2 snapshots were stored in this window, fewer than the 3 this feature needs, so the sections below report the shortage rather than a trend."
    ]);

    for (const id of snapshotSections) {
      assert.equal(section(sections, id).coverage, "insufficient");
    }

    assert.deepEqual(texts(sections, "risk-transitions"), [
      "Only 2 snapshots were stored in this window, fewer than the 3 needed to report risk level transitions."
    ]);
    assert.deepEqual(texts(sections, "watch-conditions"), [
      "Only 2 snapshots were stored in this window, fewer than the 3 needed to report watch conditions."
    ]);
    assert.deepEqual(texts(sections, "persistent-conflicts"), [
      "Only 2 snapshots were stored in this window, fewer than the 3 needed to report persistent conflicts."
    ]);
    assert.deepEqual(texts(sections, "recurring-drivers"), [
      "Only 2 snapshots were stored in this window, fewer than the 3 needed to report recurring drivers."
    ]);
  });

  it("reports from the minimum upward", () => {
    const sections = buildInput({ snapshots: series(minimumSnapshots) });

    for (const id of snapshotSections) {
      assert.equal(section(sections, id).coverage, "reported");
    }
  });

  it("states the largest gap and the covered span over a full window", () => {
    const snapshots = [snapshot(811, 0), snapshot(824, hour), snapshot(831, hour + 51 * hour), snapshot(903, hour + 52 * hour)];
    const sections = buildInput({ snapshots });

    assert.deepEqual(texts(sections, "window-coverage"), [
      "4 situation snapshots cover the requested 7d window.",
      "The covered span runs 2026-09-14T08:00:00.000Z to 2026-09-16T13:00:00.000Z, narrower than the requested 7d window.",
      "The largest gap between consecutive snapshots is 2 days 3 hours."
    ]);
    assert.deepEqual(line(sections, "window-coverage", "window-gap").values, { gapMs: 183_600_000 });
    assert.deepEqual(line(sections, "window-coverage", "window-gap").sourceRows, [
      { table: "situation_overviews", ids: [824, 831] }
    ]);
  });

  it("states what a truncated read left out", () => {
    const sections = buildInput({ snapshots: series(3), snapshotsTruncated: true, snapshotsLeftOut: 412 });

    assert.equal(
      line(sections, "window-coverage", "window-truncated").text,
      "This window held more than 5000 snapshots; the 5000 most recent were read and 412 older ones were left out."
    );
  });
});

describe("bias and risk transitions", () => {
  it("lists transitions oldest-first with their gap", () => {
    const biases: InsightSnapshot["bias"][] = ["bullish", "bullish", "neutral", "neutral", "strong_bearish"];
    const sections = buildInput({ snapshots: series(5, (index) => ({ bias: biases[index] })) });

    assert.deepEqual(texts(sections, "bias-transitions"), [
      "Bias moved from bullish to neutral at 2026-09-14T10:00:00.000Z, 1 hour after the previous snapshot.",
      "Bias moved from neutral to strong bearish at 2026-09-14T12:00:00.000Z, 1 hour after the previous snapshot."
    ]);

    const first = line(sections, "bias-transitions", "bias-transition-101-102");
    assert.deepEqual(first.values, {
      previous: "bullish",
      current: "neutral",
      at: "2026-09-14T10:00:00.000Z",
      gapMs: hour
    });
    assert.deepEqual(first.sourceRows, [{ table: "situation_overviews", ids: [101, 102] }]);
  });

  it("reports a steady bias, including a steady unknown", () => {
    const steady = buildInput({ snapshots: series(14) });
    assert.deepEqual(texts(steady, "bias-transitions"), ["Bias held at bullish across all 14 snapshots."]);

    const unknown = buildInput({ snapshots: series(14, () => ({ bias: "unknown" })) });
    assert.deepEqual(texts(unknown, "bias-transitions"), ["Bias held at unknown across all 14 snapshots."]);
    assert.equal(line(unknown, "bias-transitions", "bias-steady").sourceRows[0].ids.length, 14);
  });

  it("keeps the twenty most recent transitions and says how many it dropped", () => {
    // 28 snapshots alternating bias give 27 transitions.
    const sections = buildInput({
      snapshots: series(28, (index) => ({ bias: index % 2 === 0 ? "bullish" : "bearish" }))
    });
    const lines = section(sections, "bias-transitions").lines;

    assert.equal(lines.length, maxTransitionLines + 1);
    assert.equal(lines[0].id, "bias-transition-107-108");
    assert.equal(lines[maxTransitionLines - 1].id, "bias-transition-126-127");
    assert.equal(
      lines[maxTransitionLines].text,
      "Bias changed 27 times in this window; the 20 most recent are listed and 7 earlier ones were left out."
    );
  });

  it("mirrors the four cases over risk level", () => {
    const levels: InsightSnapshot["riskLevel"][] = ["moderate", "moderate", "elevated"];
    const moved = buildInput({ snapshots: series(3, (index) => ({ riskLevel: levels[index] })) });

    assert.deepEqual(texts(moved, "risk-transitions"), [
      "Risk level moved from moderate to elevated at 2026-09-14T10:00:00.000Z, 1 hour after the previous snapshot."
    ]);

    const steady = buildInput({ snapshots: series(14) });
    assert.deepEqual(texts(steady, "risk-transitions"), ["Risk level held at moderate across all 14 snapshots."]);

    const churn = buildInput({
      snapshots: series(28, (index) => ({ riskLevel: index % 2 === 0 ? "moderate" : "high" }))
    });
    assert.equal(
      section(churn, "risk-transitions").lines[maxTransitionLines].text,
      "Risk level changed 27 times in this window; the 20 most recent are listed and 7 earlier ones were left out."
    );
  });

  it("renders a multi-day gap inside the transition text", () => {
    const snapshots = [
      snapshot(200, 0, { bias: "bullish" }),
      snapshot(201, hour, { bias: "bullish" }),
      snapshot(202, hour + 51 * hour, { bias: "neutral" })
    ];
    const sections = buildInput({ snapshots });

    assert.deepEqual(texts(sections, "bias-transitions"), [
      "Bias moved from bullish to neutral at 2026-09-16T12:00:00.000Z, 2 days 3 hours after the previous snapshot."
    ]);
  });
});

describe("recurring drivers and persistent conflicts", () => {
  it("drops a single appearance and states a constant or changed direction", () => {
    const snapshots = series(3, (index) => ({
      mainDrivers:
        index === 0
          ? [driver("d-trend", "Trend Strength", "bullish", "trend_strength"), driver("d-once", "Liquidations", "bearish", "liquidations")]
          : [
              driver("d-trend", "Trend Strength", "bullish", "trend_strength"),
              driver("d-mom", "Momentum Exhaustion", index === 1 ? "neutral" : "bearish", "momentum_exhaustion")
            ]
    }));
    const sections = buildInput({ snapshots });

    assert.deepEqual(texts(sections, "recurring-drivers"), [
      "Trend Strength was a main driver in 3 of 3 snapshots, holding bullish.",
      "Momentum Exhaustion was a main driver in 2 of 3 snapshots, moving from neutral to bearish."
    ]);

    const trend = line(sections, "recurring-drivers", "driver-trend_strength");
    assert.deepEqual(trend.values, {
      sourceWidget: "trend_strength",
      label: "Trend Strength",
      count: 3,
      snapshotCount: 3,
      firstDirection: "bullish",
      lastDirection: "bullish",
      mostRecentAt: "2026-09-14T10:00:00.000Z"
    });
    assert.deepEqual(trend.sourceRows, [{ table: "situation_overviews", ids: [100, 101, 102] }]);
  });

  it("takes the label from the most recent appearance and the key from the id when no widget is named", () => {
    const snapshots = series(3, (index) => ({
      mainDrivers: [driver("macro-drift", index === 2 ? "Macro Drift (renamed)" : "Macro Drift", "risk_on")]
    }));
    const sections = buildInput({ snapshots });

    assert.deepEqual(texts(sections, "recurring-drivers"), [
      "Macro Drift (renamed) was a main driver in 3 of 3 snapshots, holding risk on."
    ]);
    assert.equal(line(sections, "recurring-drivers", "driver-macro-drift").values.sourceWidget, "macro-drift");
  });

  it("orders by count, then recency, then key", () => {
    const snapshots = [
      snapshot(300, 0, { mainDrivers: [driver("a", "Alpha", "bullish"), driver("b", "Bravo", "bullish")] }),
      snapshot(301, hour, { mainDrivers: [driver("a", "Alpha", "bullish"), driver("b", "Bravo", "bullish")] }),
      snapshot(302, 2 * hour, {
        mainDrivers: [driver("a", "Alpha", "bullish"), driver("c", "Charlie", "bearish"), driver("d", "Delta", "bearish")]
      }),
      snapshot(303, 3 * hour, { mainDrivers: [driver("c", "Charlie", "bearish"), driver("d", "Delta", "bearish")] })
    ];
    const sections = buildInput({ snapshots });

    assert.deepEqual(
      section(sections, "recurring-drivers").lines.map((entry) => entry.id),
      ["driver-a", "driver-c", "driver-d", "driver-b"]
    );
  });

  it("reports no driver and no recurrence separately", () => {
    const none = buildInput({ snapshots: series(3) });
    assert.deepEqual(texts(none, "recurring-drivers"), ["No snapshot in this window recorded a main driver."]);

    const once = buildInput({
      snapshots: series(3, (index) => ({ mainDrivers: [driver(`d-${index}`, `Driver ${index}`, "bullish")] }))
    });
    assert.deepEqual(texts(once, "recurring-drivers"), ["No widget was a main driver in more than one snapshot."]);
  });

  it("caps the listed groups and says how many it left out", () => {
    const drivers = Array.from({ length: 9 }, (_unused, index) =>
      driver(`d-${index}`, `Driver ${index}`, "bullish")
    );
    const sections = buildInput({ snapshots: series(3, () => ({ mainDrivers: drivers })) });
    const lines = section(sections, "recurring-drivers").lines;

    assert.equal(lines.length, maxListedLinesPerSection + 1);
    assert.equal(
      lines[maxListedLinesPerSection].text,
      "9 widgets recurred as main drivers; the 6 most frequent are listed and 3 others were left out."
    );
  });

  it("mirrors the driver cases over conflicting signals", () => {
    const snapshots = series(3, (index) => ({
      conflictingSignals: [
        driver("c-dollar", "Dollar Pressure", "risk_off", "dollar_pressure"),
        driver("c-volume", "Volume Confirmation", index === 2 ? "neutral" : "bearish", "volume_confirmation")
      ]
    }));
    const sections = buildInput({ snapshots });

    assert.deepEqual(texts(sections, "persistent-conflicts"), [
      "Dollar Pressure conflicted with the overall bias in 3 of 3 snapshots, holding risk off.",
      "Volume Confirmation conflicted with the overall bias in 3 of 3 snapshots, moving from bearish to neutral."
    ]);

    const none = buildInput({ snapshots: series(3) });
    assert.deepEqual(texts(none, "persistent-conflicts"), [
      "No snapshot in this window recorded a conflicting signal."
    ]);

    const once = buildInput({
      snapshots: series(3, (index) => ({ conflictingSignals: [driver(`c-${index}`, `Conflict ${index}`, "bearish")] }))
    });
    assert.deepEqual(texts(once, "persistent-conflicts"), [
      "No widget conflicted with the overall bias in more than one snapshot."
    ]);

    const conflicts = Array.from({ length: 8 }, (_unused, index) => driver(`c-${index}`, `Conflict ${index}`, "bearish"));
    const capped = buildInput({ snapshots: series(3, () => ({ conflictingSignals: conflicts })) });
    assert.equal(
      section(capped, "persistent-conflicts").lines[maxListedLinesPerSection].text,
      "8 widgets conflicted more than once; the 6 most frequent are listed and 2 others were left out."
    );
  });
});

describe("watch conditions", () => {
  it("lists a single appearance and groups by condition id rather than source widget", () => {
    const snapshots = series(3, (index) =>
      index === 2
        ? {
            watchConditions: [
              watch("watch-support-loss", "Support pressure", "warning", "support_resistance_pressure"),
              watch("watch-resistance-reclaim", "Resistance reclaim", "info", "support_resistance_pressure")
            ]
          }
        : {}
    );
    const sections = buildInput({ snapshots });

    assert.deepEqual(texts(sections, "watch-conditions"), [
      "Support pressure was raised in 1 of 3 snapshots at warning severity, most recently at 2026-09-14T10:00:00.000Z.",
      "Resistance reclaim was raised in 1 of 3 snapshots at info severity, most recently at 2026-09-14T10:00:00.000Z."
    ]);
    assert.deepEqual(line(sections, "watch-conditions", "watch-watch-support-loss").values, {
      conditionId: "watch-support-loss",
      label: "Support pressure",
      severity: "warning",
      condition: "Support pressure condition text",
      count: 1,
      snapshotCount: 3,
      mostRecentAt: "2026-09-14T10:00:00.000Z"
    });
  });

  it("takes the highest severity a group reached and leads the ordering with it", () => {
    const snapshots = series(8, (index) => ({
      watchConditions: [
        watch("watch-confirmation", "Confirmation", index === 7 ? "critical" : "info"),
        watch("watch-volume-confirmation", "Volume confirmation", "info")
      ]
    }));
    const sections = buildInput({ snapshots });

    assert.deepEqual(texts(sections, "watch-conditions"), [
      "Confirmation was raised in 8 of 8 snapshots at critical severity, most recently at 2026-09-14T15:00:00.000Z.",
      "Volume confirmation was raised in 8 of 8 snapshots at info severity, most recently at 2026-09-14T15:00:00.000Z."
    ]);
  });

  it("puts a one-appearance critical above a seven-appearance info", () => {
    const snapshots = series(7, (index) => ({
      watchConditions:
        index === 6
          ? [watch("watch-support-loss", "Support pressure", "info"), watch("watch-confirmation", "Confirmation", "critical")]
          : [watch("watch-support-loss", "Support pressure", "info")]
    }));
    const sections = buildInput({ snapshots });

    assert.deepEqual(
      section(sections, "watch-conditions").lines.map((entry) => entry.id),
      ["watch-watch-confirmation", "watch-watch-support-loss"]
    );
  });

  it("reports an empty section and a capped one", () => {
    const none = buildInput({ snapshots: series(3) });
    assert.deepEqual(texts(none, "watch-conditions"), ["No watch condition was raised in this window."]);

    const many = Array.from({ length: 9 }, (_unused, index) => watch(`watch-${index}`, `Watch ${index}`, "info"));
    const capped = buildInput({ snapshots: series(3, () => ({ watchConditions: many })) });
    assert.equal(
      section(capped, "watch-conditions").lines[maxListedLinesPerSection].text,
      "9 watch conditions were raised; the 6 most significant are listed and 3 others were left out."
    );
  });
});

describe("data coverage", () => {
  it("reports a fully covered window", () => {
    const sections = buildInput({ snapshots: series(14) });

    assert.deepEqual(texts(sections, "data-coverage"), [
      "Every snapshot in this window was built from the full expected input set.",
      "No snapshot reported a stale input.",
      "No snapshot reported a missing input.",
      "Confidence was medium in all 14 snapshots."
    ]);
  });

  it("counts partial snapshots in both their plural forms", () => {
    const one = buildInput({
      snapshots: series(14, (index) => ({
        meta: { missingInputs: [], staleInputs: [], usedFallbacks: [], isPartial: index === 0 }
      }))
    });
    assert.equal(
      line(one, "data-coverage", "coverage-partial").text,
      "1 of 14 snapshots was partial, built without every expected input."
    );

    const six = buildInput({
      snapshots: series(14, (index) => ({
        meta: { missingInputs: [], staleInputs: [], usedFallbacks: [], isPartial: index < 6 }
      }))
    });
    assert.equal(
      line(six, "data-coverage", "coverage-partial").text,
      "6 of 14 snapshots were partial, built without every expected input."
    );
    assert.equal(line(six, "data-coverage", "coverage-partial").sourceRows[0].ids.length, 6);
  });

  it("names stale and missing widgets from the catalog", () => {
    const sections = buildInput({
      snapshots: series(14, (index) => ({
        meta: {
          missingInputs: index < 2 ? ["derivatives_pressure"] : [],
          // Distinct counts, so the descending-count order leads and the
          // ascending-id tiebreak stays out of the way.
          staleInputs: [
            ...(index < 6 ? ["volume_confirmation"] : []),
            ...(index < 4 ? ["macro_risk_pulse"] : []),
            ...(index < 2 ? ["gold_risk_hedge"] : [])
          ],
          usedFallbacks: [],
          isPartial: false
        }
      }))
    });

    assert.equal(
      line(sections, "data-coverage", "coverage-stale").text,
      "Stale inputs appeared in 6 of 14 snapshots: Volume Confirmation, Macro Risk Pulse and Gold / Risk Hedge."
    );
    assert.equal(
      line(sections, "data-coverage", "coverage-missing").text,
      "Missing inputs appeared in 2 of 14 snapshots: Derivatives Pressure."
    );
  });

  it("appends the left-out count past six named widgets", () => {
    const nine = Array.from({ length: 9 }, (_unused, index) => `widget_${index}`);
    const sections = buildInput({
      snapshots: series(14, (index) => ({
        meta: { missingInputs: [], staleInputs: index < 9 ? nine : [], usedFallbacks: [], isPartial: false }
      }))
    });

    assert.equal(
      line(sections, "data-coverage", "coverage-stale").text,
      "Stale inputs appeared in 9 of 14 snapshots: widget 0, widget 1, widget 2, widget 3, widget 4, widget 5 and 3 others."
    );
  });

  it("lists confidence in the fixed order and omits a zero count", () => {
    const confidences: InsightSnapshot["confidence"][] = [
      ...Array.from({ length: 8 }, () => "high" as const),
      ...Array.from({ length: 5 }, () => "medium" as const),
      "low"
    ];
    const varying = buildInput({ snapshots: series(14, (index) => ({ confidence: confidences[index] })) });

    assert.equal(
      line(varying, "data-coverage", "coverage-confidence").text,
      "Confidence was high in 8 snapshots, medium in 5 and low in 1."
    );

    const twoOfThree = buildInput({
      snapshots: series(14, (index) => ({ confidence: index < 8 ? "high" : "low" }))
    });
    assert.equal(
      line(twoOfThree, "data-coverage", "coverage-confidence").text,
      "Confidence was high in 8 snapshots and low in 6."
    );
    assert.equal(line(twoOfThree, "data-coverage", "coverage-confidence").values.medium, 0);

    const singleLeader = buildInput({
      snapshots: series(14, (index) => ({ confidence: index === 0 ? "high" : "medium" }))
    });
    assert.equal(
      line(singleLeader, "data-coverage", "coverage-confidence").text,
      "Confidence was high in 1 snapshot and medium in 13."
    );
  });
});

describe("alert activity", () => {
  it("omits the section without failing the request", () => {
    const sections = buildInput({ snapshots: series(3), alerts: null });
    const activity = section(sections, "alert-activity");

    assert.equal(activity.category, "personal");
    assert.equal(activity.coverage, "omitted");
    assert.deepEqual(activity.lines, [
      {
        id: "alerts-omitted",
        text: "Alert activity is personal to a signed-in account with the analyst role, so it is not included in this response.",
        values: {},
        sourceRows: []
      }
    ]);
  });

  it("separates an omitted section from an empty one", () => {
    const sections = buildInput({ snapshots: series(3), alerts: [] });

    assert.equal(section(sections, "alert-activity").coverage, "empty");
    assert.deepEqual(texts(sections, "alert-activity"), [
      "No alert event was raised for your account in this window."
    ]);
  });

  it("counts, groups and orders the events", () => {
    const alerts = [
      alertEvent(10, 0, { title: "Risk level changed", severity: "critical" }),
      alertEvent(11, hour, { title: "Situation bias changed" }),
      alertEvent(12, 2 * hour, { title: "Situation bias changed" }),
      alertEvent(13, 3 * hour, { title: "Situation bias changed", acknowledged: false }),
      alertEvent(14, 4 * hour, { title: "Situation bias changed" })
    ];
    const sections = buildInput({ snapshots: series(3), alerts });

    assert.deepEqual(texts(sections, "alert-activity"), [
      "5 alert events were raised for your account in this window.",
      "Risk level changed fired once at critical severity, at 2026-09-14T08:00:00.000Z.",
      "Situation bias changed fired 4 times at warning severity, most recently at 2026-09-14T12:00:00.000Z.",
      "1 of those events is still unacknowledged."
    ]);
    assert.deepEqual(line(sections, "alert-activity", "alert-group-1").values, {
      title: "Situation bias changed",
      severity: "warning",
      count: 4,
      mostRecentAt: "2026-09-14T12:00:00.000Z"
    });
    assert.deepEqual(line(sections, "alert-activity", "alert-group-1").sourceRows, [
      { table: "alert_events", ids: [11, 12, 13, 14] }
    ]);
  });

  it("states the singular count and each acknowledgement form", () => {
    const one = buildInput({ snapshots: series(3), alerts: [alertEvent(20, 0, { title: "Risk level changed" })] });
    assert.equal(
      line(one, "alert-activity", "alerts-count").text,
      "1 alert event was raised for your account in this window."
    );
    assert.equal(line(one, "alert-activity", "alerts-unacknowledged").text, "All of those events were acknowledged.");

    const three = buildInput({
      snapshots: series(3),
      alerts: [
        alertEvent(21, 0, { acknowledged: false }),
        alertEvent(22, hour, { acknowledged: false }),
        alertEvent(23, 2 * hour, { acknowledged: false })
      ]
    });
    assert.equal(
      line(three, "alert-activity", "alerts-unacknowledged").text,
      "3 of those events are still unacknowledged."
    );
  });

  it("reports the read cap and the group cap separately", () => {
    const alerts = Array.from({ length: 12 }, (_unused, index) =>
      alertEvent(30 + index, index * hour, { title: `Alert ${index}` })
    );
    const sections = buildInput({ snapshots: series(3), alerts, alertsTruncated: true, alertsLeftOut: 63 });

    assert.equal(
      line(sections, "alert-activity", "alerts-groups-truncated").text,
      "12 alert titles fired in this window; the 6 most significant are listed and 6 others were left out."
    );
    assert.equal(
      line(sections, "alert-activity", "alerts-truncated").text,
      "This window held more than 500 alert events; the 500 most recent were read and 63 older ones were left out."
    );
  });
});

describe("determinism", () => {
  it("builds deeply equal output from the same input twice", () => {
    const snapshots = series(14, (index) => ({
      bias: index % 3 === 0 ? "bullish" : "neutral",
      riskLevel: index % 4 === 0 ? "elevated" : "moderate",
      confidence: index % 2 === 0 ? "high" : "low",
      mainDrivers: [driver("d-trend", "Trend Strength", "bullish", "trend_strength")],
      conflictingSignals: [driver("c-dollar", "Dollar Pressure", "risk_off", "dollar_pressure")],
      watchConditions: [watch("watch-support-loss", "Support pressure", "warning")],
      meta: { missingInputs: ["liquidations"], staleInputs: [], usedFallbacks: [], isPartial: true }
    }));
    const alerts = [alertEvent(40, 0), alertEvent(41, hour, { severity: "info", title: "Score moved" })];

    assert.deepEqual(buildInput({ snapshots, alerts }), buildInput({ snapshots, alerts }));
  });
});
