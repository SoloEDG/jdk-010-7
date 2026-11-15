import type { Kind, LabDocument } from "./document";
import {
  COURSE_FILE_TYPE,
  COURSE_VERSION,
  type Course,
  type GradingRule,
  type Stage,
} from "./course";

export function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function defaultRule(screenId = ""): GradingRule {
  return {
    id: uid("rule"),
    metric: "energyRatio",
    comparator: ">=",
    value: 0.8,
    screenId,
  };
}

export function createStage(
  layout: LabDocument,
  index: number,
  patch: Partial<Stage> = {},
): Stage {
  const screens = layout.items.filter((e) => e.kind === "screen");
  // 默认从布局推导授权：布局用到的非基础器件同时进入允许列表与本阶段解锁，
  // 保证新建阶段不会立刻出现“未授权器件”的衔接错误；教师可再手动收窄。
  const usedKinds = Array.from(new Set(layout.items.map((e) => e.kind)));
  const derived = usedKinds.filter((k) => !BASE_GRANT.includes(k));
  const base: Stage = {
    id: uid("stage"),
    name: `阶段 ${index + 1}`,
    brief: "请在此填写本阶段的任务说明。",
    hints: [],
    allowedKinds: [...BASE_GRANT, ...derived],
    layout: structuredClone(layout),
    unlocks: derived,
    rules: [defaultRule(screens[0]?.id ?? "")],
  };
  return {
    ...base,
    ...patch,
    id: patch.id ?? base.id,
    layout: patch.layout ? structuredClone(patch.layout) : base.layout,
  };
}

/** 初始即授权的器件种类（光源与接收屏是任何实验的基础）。 */
const BASE_GRANT: Kind[] = ["source", "screen"];

export function createCourse(title: string, firstLayout: LabDocument): Course {
  const now = new Date().toISOString();
  // 从初始布局推导第一阶段授权：布局里用到的非基础器件，
  // 既放进允许列表，也声明为本阶段解锁，保证开箱即通过衔接校验。
  const usedKinds = Array.from(new Set(firstLayout.items.map((e) => e.kind)));
  const derived = usedKinds.filter((k) => !BASE_GRANT.includes(k));
  const firstStage = createStage(firstLayout, 0, {
    name: "阶段 1 · 入门",
    allowedKinds: [...BASE_GRANT, ...derived],
    unlocks: derived,
  });
  return {
    fileType: COURSE_FILE_TYPE,
    version: COURSE_VERSION,
    id: uid("course"),
    title,
    description: "",
    createdAt: now,
    stages: [firstStage],
  };
}

/** 教师在制作器里复制阶段时，深拷贝并更换所有 id，避免阶段间 id 冲突。 */
export function cloneStage(stage: Stage, index: number): Stage {
  const clone = structuredClone(stage);
  const idMap = new Map<string, string>();
  clone.id = uid("stage");
  clone.name = `${stage.name}（副本）`;
  clone.layout = {
    ...clone.layout,
    items: clone.layout.items.map((e) => {
      const next = uid("dev");
      idMap.set(e.id, next);
      return { ...e, id: next };
    }),
  };
  clone.rules = clone.rules.map((r) => ({
    ...r,
    id: uid("rule"),
    screenId: r.screenId ? (idMap.get(r.screenId) ?? "") : "",
  }));
  clone.name = clone.name || `阶段 ${index + 1}`;
  return clone;
}

/**
 * 学生端可见的“已解锁种类”。
 * = 初始集合 ∪ 此前各阶段 unlocks ∪ 当前阶段自己的 unlocks
 * （当前阶段声明解锁的器件在本阶段内即可用，进入下一阶段后成为既有授权）。
 */
export function unlockedKinds(course: Course, stageIndex: number): Set<Kind> {
  const set = new Set<Kind>(["source", "screen"]);
  for (let i = 0; i <= stageIndex; i++) {
    const stage = course.stages[i];
    if (stage) for (const k of stage.unlocks) set.add(k);
  }
  return set;
}
