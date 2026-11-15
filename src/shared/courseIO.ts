import type { Kind, LabDocument } from "./document";
import {
  COURSE_FILE_TYPE,
  COURSE_VERSION,
  type Comparator,
  type Course,
  type GradingRule,
  type MetricId,
  type Stage,
} from "./course";

/**
 * 课程文件的导入/导出与严格校验。
 *
 * 校验策略：收集全部错误而不是遇到第一个就抛出——教师一次能看到
 * 所有需要修复的阶段；任何错误都不会被“跳过”，校验失败的课程
 * 不允许进入学生模式（UI 层据此阻断）。
 */

export interface ValidationIssue {
  stageId?: string;
  stageName?: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  course: Course | null;
}

const KINDS: Kind[] = ["source", "mirror", "lens", "prism", "screen"];
const METRICS: MetricId[] = [
  "energyRatio",
  "rmsRadius",
  "hitRays",
  "centroid",
];
const COMPARATORS: Comparator[] = [">=", "<=", ">", "<", "approx"];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validateDocumentShape(
  doc: unknown,
  issues: ValidationIssue[],
  where: string,
): doc is LabDocument {
  if (!doc || typeof doc !== "object") {
    issues.push({ message: `${where}：缺少场景布局` });
    return false;
  }
  const d = doc as Record<string, unknown>;
  if (d.version !== 1 || !Array.isArray(d.items)) {
    issues.push({ message: `${where}：布局不是合法的实验文档（version/items）` });
    return false;
  }
  let valid = true;
  for (const raw of d.items as unknown[]) {
    const e = raw as Record<string, unknown>;
    if (!e || typeof e !== "object" || typeof e.id !== "string") {
      issues.push({ message: `${where}：存在没有 id 的器件` });
      valid = false;
      continue;
    }
    if (!KINDS.includes(e.kind as Kind)) {
      issues.push({
        stageId: undefined,
        message: `${where}：器件 ${e.id} 的类型 “${String(e.kind)}” 已缺失或不被支持`,
      });
      valid = false;
    }
    for (const k of [
      "x",
      "y",
      "angle",
      "size",
      "power",
      "rays",
      "spread",
      "wavelength",
      "focal",
      "index",
    ]) {
      if (!isFiniteNumber(e[k])) {
        issues.push({
          message: `${where}：器件 ${e.id} 的参数 ${k} 不是有限数值`,
        });
        valid = false;
      }
    }
  }
  return valid;
}

function validateRule(
  rule: unknown,
  stage: Stage,
  issues: ValidationIssue[],
): rule is GradingRule {
  const r = rule as Record<string, unknown>;
  const tag = `阶段「${stage.name}」判定条件`;
  if (!r || typeof r !== "object" || typeof r.id !== "string") {
    issues.push({ stageId: stage.id, stageName: stage.name, message: `${tag}缺少 id` });
    return false;
  }
  let ok = true;
  if (!METRICS.includes(r.metric as MetricId)) {
    issues.push({ stageId: stage.id, stageName: stage.name, message: `${tag} ${r.id}：未知测量指标 “${String(r.metric)}”` });
    ok = false;
  }
  if (!COMPARATORS.includes(r.comparator as Comparator)) {
    issues.push({ stageId: stage.id, stageName: stage.name, message: `${tag} ${r.id}：未知比较算子 “${String(r.comparator)}”` });
    ok = false;
  }
  if (!isFiniteNumber(r.value)) {
    issues.push({ stageId: stage.id, stageName: stage.name, message: `${tag} ${r.id}：目标值不是有限数值，属于损坏的判定条件` });
    ok = false;
  }
  if (r.comparator === "approx" && !isFiniteNumber(r.tolerance)) {
    issues.push({ stageId: stage.id, stageName: stage.name, message: `${tag} ${r.id}：approx 条件缺少有限容差 tolerance` });
    ok = false;
  }
  // 规则引用的接收屏必须存在于该阶段布局中——缺失器件的一种典型形态
  if (typeof r.screenId === "string" && r.screenId !== "") {
    const exists = stage.layout.items.some(
      (e) => e.id === r.screenId && e.kind === "screen",
    );
    if (!exists) {
      issues.push({
        stageId: stage.id,
        stageName: stage.name,
        message: `${tag} ${r.id}：引用的接收屏 ${r.screenId} 在本阶段布局中缺失`,
      });
      ok = false;
    }
  }
  return ok;
}

/**
 * 阶段衔接（解锁链）校验。
 *
 * 语义约定：
 * - 初始可用集合为 {source, screen}；
 * - 阶段 i 开始时，可用集合 = 初始集合 ∪ 阶段 0..i-1 的全部 unlocks；
 * - 阶段 i 自己 unlocks 的器件在“本阶段内”即可用（学生要先用它完成任务，
 *   才能谈解锁），并自动并入下一阶段的可用集合；
 * - 因此阶段 i 的 allowedKinds 与布局器件种类必须 ⊆ 进入可用集合 ∪ 本阶段 unlocks；
 * - 本阶段 unlocks 还必须出现在下一阶段的布局或允许列表中，保证衔接明确。
 */
function validateProgression(course: Course, issues: ValidationIssue[]) {
  const entering = new Set<Kind>(["source", "screen"]);
  course.stages.forEach((stage, i) => {
    const available = new Set<Kind>(entering);
    for (const k of stage.unlocks) available.add(k);

    for (const e of stage.layout.items) {
      if (!available.has(e.kind)) {
        issues.push({
          stageId: stage.id,
          stageName: stage.name,
          message: `阶段「${stage.name}」初始布局使用了尚未解锁的器件类型（${e.kind}），衔接断裂`,
        });
      }
    }
    for (const k of stage.allowedKinds) {
      if (!available.has(k)) {
        issues.push({
          stageId: stage.id,
          stageName: stage.name,
          message: `阶段「${stage.name}」允许添加未解锁的器件类型（${k}）`,
        });
      }
    }
    // 本阶段解锁的器件应当属于本阶段可操作范围，否则“解锁”无从发生
    for (const k of stage.unlocks) {
      if (!stage.allowedKinds.includes(k)) {
        issues.push({
          stageId: stage.id,
          stageName: stage.name,
          message: `阶段「${stage.name}」声明解锁 ${k}，但本阶段允许列表中没有它，学生无法完成解锁`,
        });
      }
    }
    for (const k of stage.unlocks) entering.add(k);

    if (i < course.stages.length - 1 && stage.unlocks.length > 0) {
      const next = course.stages[i + 1];
      for (const k of stage.unlocks) {
        const used =
          next.layout.items.some((e) => e.kind === k) ||
          next.allowedKinds.includes(k);
        if (!used) {
          issues.push({
            stageId: stage.id,
            stageName: stage.name,
            message: `阶段「${stage.name}」解锁的 ${k} 在下一阶段「${next.name}」的初始布局与允许列表中均未出现，衔接不明确`,
          });
        }
      }
    }
  });
}

/** 循环阶段检测：把阶段间的“解锁/衔接”关系视为有向图做 DFS 染色。 */
function detectCycles(course: Course, issues: ValidationIssue[]) {
  // 阶段是线性序列，额外检查 id 唯一性与显式 next 引用形成的环
  const ids = new Set<string>();
  for (const s of course.stages) {
    if (ids.has(s.id)) {
      issues.push({ stageId: s.id, stageName: s.name, message: `阶段 id 重复：${s.id}` });
    }
    ids.add(s.id);
  }
  // 通用环检测：边 i -> i+1（线性链天然无环），同时防御数据里出现的
  // 任意 back/forward 引用（通过 unlocks 无法表达环，这里保留扩展点）
  const adj = new Map<string, string[]>();
  course.stages.forEach((s, i) => {
    if (i + 1 < course.stages.length)
      adj.set(s.id, [course.stages[i + 1].id]);
  });
  const color = new Map<string, 0 | 1 | 2>();
  const dfs = (id: string): boolean => {
    color.set(id, 1);
    for (const next of adj.get(id) ?? []) {
      const c = color.get(next) ?? 0;
      if (c === 1) return true;
      if (c === 0 && dfs(next)) return true;
    }
    color.set(id, 2);
    return false;
  };
  for (const s of course.stages) {
    if ((color.get(s.id) ?? 0) === 0 && dfs(s.id)) {
      issues.push({ stageId: s.id, stageName: s.name, message: "阶段顺序中检测到循环引用" });
      break;
    }
  }
}

export function validateCourse(raw: unknown): ValidationReport {
  const issues: ValidationIssue[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, issues: [{ message: "文件不是合法的课程对象" }], course: null };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.fileType !== COURSE_FILE_TYPE || obj.version !== COURSE_VERSION) {
    issues.push({
      message: `文件标识不匹配（期望 ${COURSE_FILE_TYPE} v${COURSE_VERSION}，实际 ${String(obj.fileType)} v${String(obj.version)}）`,
    });
  }
  if (typeof obj.id !== "string" || !obj.id)
    issues.push({ message: "课程缺少 id" });
  if (typeof obj.title !== "string" || !obj.title.trim())
    issues.push({ message: "课程缺少标题" });
  if (!Array.isArray(obj.stages) || obj.stages.length === 0) {
    issues.push({ message: "课程至少需要一个阶段" });
    return { ok: false, issues, course: null };
  }

  const stages: Stage[] = [];
  for (const rawStage of obj.stages as unknown[]) {
    const s = rawStage as Record<string, unknown>;
    if (!s || typeof s !== "object" || typeof s.id !== "string") {
      issues.push({ message: "存在结构损坏的阶段（缺少 id）" });
      continue;
    }
    const stage = s as unknown as Stage;
    if (typeof stage.name !== "string" || !stage.name.trim())
      issues.push({ stageId: stage.id, message: `阶段 ${stage.id} 缺少名称` });
    if (typeof stage.brief !== "string")
      issues.push({ stageId: stage.id, stageName: stage.name, message: `阶段「${stage.name}」缺少任务说明` });
    if (!Array.isArray(stage.hints))
      issues.push({ stageId: stage.id, stageName: stage.name, message: `阶段「${stage.name}」的提示不是数组` });
    if (!Array.isArray(stage.allowedKinds) || stage.allowedKinds.some((k) => !KINDS.includes(k)))
      issues.push({ stageId: stage.id, stageName: stage.name, message: `阶段「${stage.name}」的允许器件列表包含未知类型` });
    if (!Array.isArray(stage.unlocks) || stage.unlocks.some((k) => !KINDS.includes(k)))
      issues.push({ stageId: stage.id, stageName: stage.name, message: `阶段「${stage.name}」的解锁器件列表包含未知类型` });

    validateDocumentShape(stage.layout, issues, `阶段「${stage.name}」布局`);

    if (!Array.isArray(stage.rules) || stage.rules.length === 0) {
      issues.push({
        stageId: stage.id,
        stageName: stage.name,
        message: `阶段「${stage.name}」没有任何判定条件，无法判定完成状态（损坏配置）`,
      });
    } else {
      const ruleIds = new Set<string>();
      for (const r of stage.rules) {
        const rid = (r as { id?: unknown })?.id;
        if (typeof rid === "string") {
          if (ruleIds.has(rid))
            issues.push({ stageId: stage.id, stageName: stage.name, message: `阶段「${stage.name}」判定条件 id 重复：${rid}` });
          ruleIds.add(rid);
        }
        validateRule(r, stage, issues);
      }
      // 至少有一条规则覆盖接收屏测量，否则条件与光路无关
      if (!stage.rules.some((r) => METRICS.includes((r as GradingRule).metric))) {
        issues.push({ stageId: stage.id, stageName: stage.name, message: `阶段「${stage.name}」的判定条件均不引用真实光路测量指标` });
      }
    }
    stages.push(stage);
  }

  // 即使阶段内部存在错误，也继续跑结构性检查（循环/衔接），
  // 保证教师一次看到全部问题，而不是修一个再冒一个。
  detectCycles(obj as unknown as Course, issues);
  validateProgression(obj as unknown as Course, issues);
  return {
    ok: issues.length === 0,
    issues,
    course: issues.length === 0 ? (obj as unknown as Course) : null,
  };
}

export function serializeCourse(course: Course): string {
  return JSON.stringify(course, null, 2);
}

export function parseCourseFile(text: string): ValidationReport {
  try {
    return validateCourse(JSON.parse(text));
  } catch (err) {
    return {
      ok: false,
      issues: [{ message: `JSON 解析失败：${(err as Error).message}` }],
      course: null,
    };
  }
}
