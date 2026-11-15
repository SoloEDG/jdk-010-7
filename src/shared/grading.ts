import type {
  Element,
  LabDocument,
  TraceResult,
} from "./document";
import type { GradingRule, StageSubmission } from "./course";

/**
 * 判定引擎：教师预览与学生试做调用的是同一个纯函数，
 * 因此同一份课程文件、同一个布局在两种模式下必然得到一致的测量结论。
 * 不读取任何状态、不产生随机数，可离线运行、可单元测试。
 */

export interface StageMetrics {
  /** 每个接收屏各自的测量指标，key 为 screen.id */
  perScreen: Record<
    string,
    {
      energy: number;
      energyRatio: number;
      rmsRadius: number;
      hitRays: number;
      centroid: number;
    }
  >;
  /** 全部光源总功率 */
  sourcePower: number;
}

export function computeStageMetrics(
  doc: LabDocument,
  result: TraceResult,
): StageMetrics {
  const sourcePower = doc.items
    .filter((e) => e.kind === "source")
    .reduce((s, e) => s + e.power, 0);
  const screens = doc.items.filter((e) => e.kind === "screen");
  const perScreen: StageMetrics["perScreen"] = {};
  for (const screen of screens) {
    const hits = result.hits.filter((h) => h.screen === screen.id);
    const energy = hits.reduce((s, h) => s + h.power, 0);
    const centroid = energy
      ? hits.reduce((s, h) => s + h.position * h.power, 0) / energy
      : 0;
    const rmsRadius = energy
      ? Math.sqrt(
          hits.reduce(
            (s, h) => s + (h.position - centroid) ** 2 * h.power,
            0,
          ) / energy,
        )
      : Infinity;
    perScreen[screen.id] = {
      energy,
      energyRatio: sourcePower ? energy / sourcePower : 0,
      rmsRadius,
      hitRays: hits.length,
      centroid,
    };
  }
  return { perScreen, sourcePower };
}

function metricValue(
  rule: GradingRule,
  metrics: StageMetrics,
  screens: Element[],
): number | null {
  const targets = rule.screenId
    ? screens.filter((s) => s.id === rule.screenId)
    : screens;
  if (targets.length === 0) return null;
  const values = targets
    .map((s) => metrics.perScreen[s.id]?.[rule.metric])
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  // 不指定接收屏时，取对学生最有利的屏（任一屏满足即可）
  return rule.screenId ? values[0] : Math.max(...values);
}

function compare(
  comparator: GradingRule["comparator"],
  actual: number,
  expected: number,
  tolerance: number,
): boolean {
  if (!Number.isFinite(actual)) return false;
  switch (comparator) {
    case ">=":
      return actual >= expected;
    case "<=":
      return actual <= expected;
    case ">":
      return actual > expected;
    case "<":
      return actual < expected;
    case "approx":
      return Math.abs(actual - expected) <= Math.max(0, tolerance);
  }
}

export interface RuleVerdict {
  ruleId: string;
  metric: GradingRule["metric"];
  expected: number;
  actual: number;
  ok: boolean;
}

export interface StageVerdict {
  passed: boolean;
  /** false 表示场景里没有规则指向的接收屏，属于不可判定而非“未达标” */
  decidable: boolean;
  results: RuleVerdict[];
  metrics: StageMetrics;
}

export function evaluateStage(
  rules: GradingRule[],
  doc: LabDocument,
  result: TraceResult,
): StageVerdict {
  const metrics = computeStageMetrics(doc, result);
  const screens = doc.items.filter((e) => e.kind === "screen");
  const results: RuleVerdict[] = rules.map((rule) => {
    const actual = metricValue(rule, metrics, screens);
    const ok =
      actual !== null &&
      compare(rule.comparator, actual, rule.value, rule.tolerance ?? 0);
    return {
      ruleId: rule.id,
      metric: rule.metric,
      expected: rule.value,
      actual: actual ?? NaN,
      ok,
    };
  });
  const decidable = results.every((r) => Number.isFinite(r.actual));
  return {
    passed: decidable && results.every((r) => r.ok),
    decidable,
    results,
    metrics,
  };
}

export function buildSubmission(
  stageId: string,
  rules: GradingRule[],
  doc: LabDocument,
  result: TraceResult,
  attempts: number,
): StageSubmission {
  const verdict = evaluateStage(rules, doc, result);
  return {
    stageId,
    passed: verdict.passed,
    results: verdict.results.map((r) => ({
      ruleId: r.ruleId,
      metric: r.metric,
      expected: r.expected,
      actual: Number.isFinite(r.actual) ? r.actual : 0,
      ok: r.ok,
    })),
    document: structuredClone(doc),
    attempts,
    at: new Date().toISOString(),
  };
}
