import type { Kind, LabDocument } from "./document";

/**
 * 课程文件（.lumen-course.json）的领域模型。
 *
 * 设计约定：
 * - 课程文件是教师与学生之间唯一的交换介质，必须能离线打开、离线判定。
 * - 答案（参考布局、测量条件）与题目描述同处一个文件，前端只能做到
 *   “不在学生界面显示、不写进学生进度”，无法对抗主动翻包的用户——
 *   这条边界在 README 与教师制作界面中均有明确说明。
 */

export const COURSE_FILE_TYPE = "lumen-course";
export const COURSE_VERSION = 1;

/** 可用于判定的真实光路测量指标。全部由 trace() 的确定性结果导出。 */
export type MetricId =
  | "energyRatio" // 接收屏命中能量 / 全部光源功率
  | "rmsRadius" // 光斑 RMS 半径 (mm)
  | "hitRays" // 命中光线条数
  | "centroid"; // 光斑重心相对接收屏中心的位置 (mm)

/** 比较算子。损坏/非法的判定配置会在导入校验中被拒绝。 */
export type Comparator = ">=" | "<=" | ">" | "<" | "approx";

export interface GradingRule {
  id: string;
  metric: MetricId;
  comparator: Comparator;
  /** 目标值；approx 时表示基准值，其余算子表示阈值 */
  value: number;
  /** approx 的容差（绝对值）。其他算子忽略该字段 */
  tolerance?: number;
  /** 作用的接收屏 id；为空字符串表示“任一接收屏满足即可” */
  screenId?: string;
  /** 教师侧备注，不会显示在学生界面，也不会写入学生进度文件 */
  note?: string;
}

export interface Stage {
  id: string;
  name: string;
  brief: string;
  /** 学生可见的引导提示，按顺序逐次开放 */
  hints: string[];
  /** 本阶段允许学生从器件库添加的器件种类 */
  allowedKinds: Kind[];
  /** 本阶段开始时的场景布局（含上一阶段解锁后保留下来的器件） */
  layout: LabDocument;
  /** 学生完成本阶段后新解锁的器件种类 */
  unlocks: Kind[];
  /** 真实光路测量判定条件，全部满足才算通过；空数组属于损坏配置 */
  rules: GradingRule[];
}

export interface Course {
  fileType: typeof COURSE_FILE_TYPE;
  version: typeof COURSE_VERSION;
  id: string;
  title: string;
  description: string;
  createdAt: string;
  stages: Stage[];
}

/** 学生提交某阶段时记录的测量快照，与教师预览共用同一套计算逻辑。 */
export interface StageSubmission {
  stageId: string;
  passed: boolean;
  /** 判定时每一条规则的实测值与是否满足，便于事后复盘/教师调试 */
  results: {
    ruleId: string;
    metric: MetricId;
    expected: number;
    actual: number;
    ok: boolean;
  }[];
  /** 判定时的完整场景，教师可据此复现学生看到的测量结论 */
  document: LabDocument;
  at: string;
  attempts: number;
}

/** 学生进度，独立于课程文件、独立于教师预览进度保存。 */
export interface StudentProgress {
  kind: "lumen-student-progress";
  version: 1;
  courseId: string;
  /** 已通过阶段的有序 id 列表 */
  completed: string[];
  /** 当前阶段 id；课程全部完成后停在最后一个阶段 */
  currentStageId: string;
  /** 每个阶段已开放到第几条提示（不含） */
  hintsRevealed: Record<string, number>;
  /** 各阶段最近一次提交快照 */
  submissions: Record<string, StageSubmission>;
  /** 各阶段学生自己的工作布局（自动保存） */
  workingDocs: Record<string, LabDocument>;
  updatedAt: string;
}

export const metricLabels: Record<MetricId, string> = {
  energyRatio: "接收能量占比",
  rmsRadius: "光斑 RMS 半径",
  hitRays: "命中光线数",
  centroid: "光斑重心位置",
};

export const comparatorLabels: Record<Comparator, string> = {
  ">=": "≥",
  "<=": "≤",
  ">": ">",
  "<": "<",
  approx: "≈",
};

export const metricUnits: Record<MetricId, string> = {
  energyRatio: "",
  rmsRadius: "mm",
  hitRays: "条",
  centroid: "mm",
};
