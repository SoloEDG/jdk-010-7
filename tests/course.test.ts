import { test } from "node:test";
import assert from "node:assert/strict";
import { trace } from "../src/features/optics/lib/trace";
import type { LabDocument } from "../src/shared/document";
import {
  computeStageMetrics,
  evaluateStage,
  buildSubmission,
} from "../src/shared/grading";
import { validateCourse, parseCourseFile } from "../src/shared/courseIO";
import { createCourse, createStage, unlockedKinds } from "../src/shared/courseFactory";
import { documentUsesAllowedKinds } from "../src/shared/guards";
import type { Course, GradingRule, Stage } from "../src/shared/course";

function doc(): LabDocument {
  return {
    version: 1,
    items: [
      {
        id: "s", kind: "source", x: 100, y: 300, angle: 0, size: 100,
        power: 1, rays: 9, spread: 0, wavelength: 550, focal: 150, index: 1.5,
      },
      {
        id: "l", kind: "lens", x: 400, y: 300, angle: 90, size: 200,
        power: 1, rays: 9, spread: 0, wavelength: 550, focal: 150, index: 1.5,
      },
      {
        id: "d", kind: "screen", x: 550, y: 300, angle: 90, size: 200,
        power: 1, rays: 9, spread: 0, wavelength: 550, focal: 150, index: 1.5,
      },
    ],
  };
}

test("stage metrics reproduce the physics trace on a focused beam", () => {
  const d = doc();
  const result = trace(d);
  const metrics = computeStageMetrics(d, result);
  const screen = metrics.perScreen["d"];
  assert.ok(screen);
  assert.ok(screen.energyRatio >= 0.99);
  assert.ok(screen.rmsRadius < 0.01);
  assert.equal(screen.hitRays, 9);
});

test("evaluateStage passes and fails deterministically with the same function", () => {
  const d = doc();
  const result = trace(d);
  const rule: GradingRule = {
    id: "r1", metric: "energyRatio", comparator: ">=", value: 0.8, screenId: "d",
  };
  const pass = evaluateStage([rule], d, result);
  assert.equal(pass.passed, true);
  const fail = evaluateStage(
    [{ ...rule, value: 1.5 }],
    d,
    result,
  );
  assert.equal(fail.passed, false);
});

test("a rule pointing at a missing screen is undecidable, not silently passed", () => {
  const d = doc();
  const result = trace(d);
  const verdict = evaluateStage(
    [{ id: "r", metric: "hitRays", comparator: ">=", value: 1, screenId: "ghost" }],
    d,
    result,
  );
  assert.equal(verdict.decidable, false);
  assert.equal(verdict.passed, false);
});

test("buildSubmission snapshots the document and per-rule actual values", () => {
  const d = doc();
  const result = trace(d);
  const sub = buildSubmission("stage-1", [
    { id: "r1", metric: "energyRatio", comparator: ">=", value: 0.8 },
  ], d, result, 1);
  assert.equal(sub.passed, true);
  assert.equal(sub.results[0].ok, true);
  assert.deepEqual(sub.document, d);
});

function validCourse(): Course {
  const d = doc();
  const course = createCourse("测试课程", d);
  course.stages[0].allowedKinds = ["source", "screen", "lens"];
  course.stages[0].unlocks = ["lens"];
  course.stages[0].rules = [
    { id: "r1", metric: "energyRatio", comparator: ">=", value: 0.8, screenId: "d" },
  ];
  const stage2 = createStage(d, 1, {
    name: "阶段 2",
    unlocks: ["mirror"],
    allowedKinds: ["source", "screen", "lens", "mirror"],
    rules: [
      { id: "r2", metric: "rmsRadius", comparator: "<=", value: 5, screenId: "d" },
    ],
  });
  course.stages.push(stage2);
  return course;
}

test("a well-formed course validates and exposes the unlock chain", () => {
  const course = validCourse();
  const report = validateCourse(course);
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  // 阶段 0 自己声明解锁 lens，本阶段内即可用
  assert.deepEqual([...unlockedKinds(course, 0)].sort(), ["lens", "screen", "source"]);
  // 进入阶段 1 后 lens 是既有授权，mirror 由阶段 1 自己解锁
  assert.ok(unlockedKinds(course, 1).has("lens"));
  assert.ok(unlockedKinds(course, 1).has("mirror"));
  // 阶段 2（不存在）视角下两阶段解锁均累积
  assert.ok(unlockedKinds(course, 2).has("mirror"));
});

test("import rejects a stage whose rule references a missing screen", () => {
  const course = validCourse();
  course.stages[0].rules[0].screenId = "missing-screen";
  const report = validateCourse(course);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.message.includes("接收屏")));
  assert.equal(report.course, null);
});

test("import rejects a stage with broken grading conditions instead of skipping it", () => {
  const course = validCourse();
  course.stages[1].rules = [
    { id: "bad", metric: "energyRatio", comparator: ">=", value: NaN },
  ];
  const report = validateCourse(course);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.message.includes("损坏")));
});

test("import flags a layout using a device kind that has not been unlocked", () => {
  const course = validCourse();
  // 阶段 2 的布局里加入棱镜，但只有 mirror 被解锁
  course.stages[1].layout.items.push({
    id: "p", kind: "prism", x: 700, y: 300, angle: 90, size: 120,
    power: 1, rays: 9, spread: 0, wavelength: 550, focal: 150, index: 1.5,
  });
  const report = validateCourse(course);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.message.includes("尚未解锁")));
});

test("stages with duplicate ids and unknown comparators are both reported", () => {
  const course = validCourse();
  const dupId = course.stages[0].id;
  course.stages[1].id = dupId;
  (course.stages[0].rules[0] as GradingRule).comparator = "==" as never;
  const report = validateCourse(course);
  assert.equal(report.ok, false);
  const messages = report.issues.map((i) => i.message).join("\n");
  assert.ok(messages.includes("重复"), messages);
  assert.ok(messages.includes("比较算子"), messages);
});

test("parseCourseFile surfaces JSON syntax errors rather than throwing", () => {
  const report = parseCourseFile("{not json");
  assert.equal(report.ok, false);
  assert.ok(report.issues[0].message.includes("JSON"));
});

test("an empty stage list is rejected because an error stage cannot be skipped", () => {
  const course = validCourse();
  course.stages = [] as Stage[];
  const report = validateCourse(course);
  assert.equal(report.ok, false);
});

test("authorization guard blocks documents containing kinds outside the grant", () => {
  const d = doc();
  const grant = new Set(["source", "screen", "lens"]);
  const allowed = (k: string) => grant.has(k);
  assert.equal(documentUsesAllowedKinds(d, allowed), true);
  const withPrism: LabDocument = {
    version: 1,
    items: [
      ...d.items,
      {
        id: "p", kind: "prism", x: 700, y: 300, angle: 90, size: 120,
        power: 1, rays: 9, spread: 0, wavelength: 550, focal: 150, index: 1.5,
      },
    ],
  };
  // 即使该文档来自撤销历史，守卫也必须拒绝——学生无法退回未授权器件
  assert.equal(documentUsesAllowedKinds(withPrism, allowed), false);
});

test("teacher preview and student submission produce identical verdicts on the same layout", () => {
  const d = doc();
  const result = trace(d);
  const rules: GradingRule[] = [
    { id: "r1", metric: "energyRatio", comparator: ">=", value: 0.8, screenId: "d" },
    { id: "r2", metric: "rmsRadius", comparator: "<=", value: 3, screenId: "d" },
  ];
  const previewVerdict = evaluateStage(rules, d, result);
  const submission = buildSubmission("s1", rules, d, result, 1);
  assert.equal(submission.passed, previewVerdict.passed);
  assert.deepEqual(
    submission.results.map((r) => [r.ruleId, r.actual, r.ok]),
    previewVerdict.results.map((r) => [r.ruleId, r.actual, r.ok]),
  );
});
