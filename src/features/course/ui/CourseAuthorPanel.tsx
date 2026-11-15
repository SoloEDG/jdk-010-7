import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FilePlus2,
  GraduationCap,
  Lightbulb,
  Lock,
  LockOpen,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import type { Kind, LabDocument } from "../../../shared/document";
import { labels } from "../../../shared/document";
import {
  comparatorLabels,
  metricLabels,
  metricUnits,
  type Comparator,
  type Course,
  type GradingRule,
  type MetricId,
  type Stage,
} from "../../../shared/course";
import type { ValidationReport } from "../../../shared/courseIO";
import { defaultRule, uid } from "../../../shared/courseFactory";

const ALL_KINDS: Kind[] = ["source", "mirror", "lens", "prism", "screen"];
const METRICS: MetricId[] = ["energyRatio", "rmsRadius", "hitRays", "centroid"];

export interface AuthorPanelProps {
  course: Course;
  stage: Stage;
  stageIndex: number;
  report: ValidationReport | null;
  currentLayout: LabDocument;
  onRenameCourse: (title: string, description: string) => void;
  onSelectStage: (index: number) => void;
  onAddStage: (layout: LabDocument) => void;
  onDuplicateStage: (id: string) => void;
  onRemoveStage: (id: string) => void;
  onUpdateStage: (id: string, patch: Partial<Stage>) => void;
  onCommitLayout: (id: string, layout: LabDocument) => void;
  onSaveDraft: () => void;
  onExport: () => void;
  onImport: () => void;
  onPreview: (index: number) => void;
  onEnterStudent: () => void;
}

function KindToggle({
  kind,
  active,
  locked,
  onClick,
}: {
  kind: Kind;
  active: boolean;
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`kind-chip ${active ? "active" : ""} ${locked ? "locked" : ""}`}
      onClick={onClick}
      title={locked ? "该器件在此阶段之前尚未解锁" : labels[kind]}
    >
      {locked ? <Lock size={10} /> : active ? <LockOpen size={10} /> : null}
      {labels[kind]}
    </button>
  );
}

export function CourseAuthorPanel(props: AuthorPanelProps) {
  const { course, stage, stageIndex, report, currentLayout } = props;
  const stageIssues = (report?.issues ?? []).filter(
    (i) => i.stageId === stage.id,
  );
  const globalIssues = (report?.issues ?? []).filter((i) => !i.stageId);

  const patch = (p: Partial<Stage>) => props.onUpdateStage(stage.id, p);
  const screens = stage.layout.items.filter((e) => e.kind === "screen");

  const patchRule = (ruleId: string, p: Partial<GradingRule>) =>
    patch({
      rules: stage.rules.map((r) =>
        r.id === ruleId ? { ...r, ...p } : r,
      ),
    });

  return (
    <section className="author-panel">
      <div className="section-title">
        课程制作器 <GraduationCap size={15} />
      </div>

      <div className="author-meta">
        <input
          aria-label="课程标题"
          value={course.title}
          onChange={(e) => props.onRenameCourse(e.target.value, course.description)}
        />
        <textarea
          aria-label="课程简介"
          rows={2}
          placeholder="课程简介（学生可见）"
          value={course.description}
          onChange={(e) => props.onRenameCourse(course.title, e.target.value)}
        />
      </div>

      <div className="stage-tabs">
        {course.stages.map((s, i) => {
          const hasError = report?.issues.some((it) => it.stageId === s.id);
          return (
            <button
              key={s.id}
              className={`stage-tab ${i === stageIndex ? "active" : ""} ${hasError ? "has-error" : ""}`}
              onClick={() => props.onSelectStage(i)}
              title={hasError ? "该阶段存在校验错误" : s.name}
            >
              {String(i + 1).padStart(2, "0")}
              {hasError && <i className="error-dot" />}
            </button>
          );
        })}
        <button
          className="stage-tab add"
          title="以当前实验台布局新增阶段"
          onClick={() => props.onAddStage(currentLayout)}
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="stage-editor">
        <input
          className="stage-name-input"
          aria-label="阶段名称"
          value={stage.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <textarea
          aria-label="阶段任务说明"
          rows={3}
          value={stage.brief}
          onChange={(e) => patch({ brief: e.target.value })}
        />

        <div className="editor-block">
          <h4>允许学生添加的器件</h4>
          <div className="chip-row">
            {ALL_KINDS.map((k) => {
              const active = stage.allowedKinds.includes(k);
              return (
                <KindToggle
                  key={k}
                  kind={k}
                  active={active}
                  onClick={() =>
                    patch({
                      allowedKinds: active
                        ? stage.allowedKinds.filter((x) => x !== k)
                        : [...stage.allowedKinds, k],
                    })
                  }
                />
              );
            })}
          </div>
        </div>

        <div className="editor-block">
          <h4>完成本阶段后解锁</h4>
          <div className="chip-row">
            {ALL_KINDS.map((k) => {
              const active = stage.unlocks.includes(k);
              return (
                <KindToggle
                  key={k}
                  kind={k}
                  active={active}
                  onClick={() =>
                    patch({
                      unlocks: active
                        ? stage.unlocks.filter((x) => x !== k)
                        : [...stage.unlocks, k],
                    })
                  }
                />
              );
            })}
          </div>
        </div>

        <div className="editor-block">
          <h4>提示（学生逐条解锁）</h4>
          {stage.hints.map((hint, i) => (
            <div className="hint-row" key={i}>
              <Lightbulb size={12} />
              <input
                aria-label={`提示 ${i + 1}`}
                value={hint}
                onChange={(e) =>
                  patch({
                    hints: stage.hints.map((h, j) =>
                      j === i ? e.target.value : h,
                    ),
                  })
                }
              />
              <button
                title="删除提示"
                onClick={() =>
                  patch({ hints: stage.hints.filter((_, j) => j !== i) })
                }
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button
            className="ghost-button"
            onClick={() => patch({ hints: [...stage.hints, "新提示："] })}
          >
            <Plus size={12} /> 添加提示
          </button>
        </div>

        <div className="editor-block">
          <h4>测量判定条件（全部满足才通过）</h4>
          {stage.rules.map((rule) => (
            <div className="rule-row" key={rule.id}>
              <select
                aria-label="测量指标"
                value={rule.metric}
                onChange={(e) =>
                  patchRule(rule.id, { metric: e.target.value as MetricId })
                }
              >
                {METRICS.map((m) => (
                  <option key={m} value={m}>
                    {metricLabels[m]}
                  </option>
                ))}
              </select>
              <select
                aria-label="比较算子"
                value={rule.comparator}
                onChange={(e) =>
                  patchRule(rule.id, { comparator: e.target.value as Comparator })
                }
              >
                {(["≥", "≤", ">", "<", "≈"] as const).map((sym, i) => {
                  const op = ([">=", "<=", ">", "<", "approx"] as Comparator[])[i];
                  return (
                    <option key={op} value={op}>
                      {sym}
                    </option>
                  );
                })}
              </select>
              <input
                aria-label="目标值"
                type="number"
                step="any"
                value={rule.value}
                onChange={(e) =>
                  patchRule(rule.id, { value: Number(e.target.value) })
                }
              />
              <small>{metricUnits[rule.metric] || (rule.metric === "energyRatio" ? "比例" : "")}</small>
              {rule.comparator === "approx" && (
                <input
                  aria-label="容差"
                  type="number"
                  step="any"
                  placeholder="容差"
                  value={rule.tolerance ?? 0}
                  onChange={(e) =>
                    patchRule(rule.id, { tolerance: Number(e.target.value) })
                  }
                />
              )}
              <select
                aria-label="目标接收屏"
                value={rule.screenId ?? ""}
                onChange={(e) => patchRule(rule.id, { screenId: e.target.value })}
              >
                <option value="">任一接收屏</option>
                {screens.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    接收屏 {i + 1}
                  </option>
                ))}
              </select>
              <button
                title="删除条件"
                onClick={() =>
                  patch({ rules: stage.rules.filter((r) => r.id !== rule.id) })
                }
              >
                <Trash2 size={12} />
              </button>
              <input
                aria-label="教师备注"
                className="rule-note"
                placeholder="教师备注（学生不可见）"
                value={rule.note ?? ""}
                onChange={(e) => patchRule(rule.id, { note: e.target.value })}
              />
            </div>
          ))}
          <button
            className="ghost-button"
            onClick={() =>
              patch({ rules: [...stage.rules, { ...defaultRule(screens[0]?.id), id: uid("rule") }] })
            }
          >
            <Plus size={12} /> 添加判定条件
          </button>
          <p className="muted small-note">
            {comparatorLabels[">="]}目标值基于真实光路追迹结果，与学生端同一计算函数，
            教师预览与学生试做结论一致。
          </p>
        </div>

        <div className="stage-actions">
          <button
            className="ghost-button"
            onClick={() => props.onCommitLayout(stage.id, currentLayout)}
          >
            <Save size={12} /> 把当前布局存为本阶段初始布局
          </button>
          <div className="stage-actions-right">
            <button
              className="ghost-button"
              onClick={() => props.onDuplicateStage(stage.id)}
            >
              <Copy size={12} /> 复制阶段
            </button>
            {course.stages.length > 1 && (
              <button
                className="ghost-button danger"
                onClick={() => props.onRemoveStage(stage.id)}
              >
                <Trash2 size={12} /> 删除阶段
              </button>
            )}
          </div>
        </div>
      </div>

      {stageIssues.length > 0 && (
        <div className="validation-box error">
          <AlertTriangle size={14} />
          <ul>
            {stageIssues.map((it, i) => (
              <li key={i}>{it.message}</li>
            ))}
          </ul>
        </div>
      )}
      {globalIssues.length > 0 && (
        <div className="validation-box error">
          <AlertTriangle size={14} />
          <ul>
            {globalIssues.map((it, i) => (
              <li key={i}>{it.message}</li>
            ))}
          </ul>
        </div>
      )}
      {report?.ok && (
        <div className="validation-box ok">
          <CheckCircle2 size={14} />
          <span>校验通过：器件、阶段衔接与判定条件均完整，可进入学生试做。</span>
        </div>
      )}

      <div className="author-footer">
        <div className="footer-row">
          <button className="ghost-button" onClick={props.onSaveDraft}>
            <Save size={12} /> 存草稿
          </button>
          <button className="ghost-button" onClick={props.onImport}>
            <Upload size={12} /> 导入课程
          </button>
          <button className="save-button" onClick={props.onExport}>
            <Download size={13} /> 导出课程文件
          </button>
        </div>
        <div className="footer-row">
          <button
            className="ghost-button"
            onClick={() => props.onPreview(stageIndex)}
          >
            <Eye size={12} /> 预览本阶段
          </button>
          <button
            className="save-button"
            disabled={!report?.ok}
            onClick={props.onEnterStudent}
            title={report?.ok ? "进入学生试做" : "存在校验错误，无法进入学生模式"}
          >
            <FilePlus2 size={13} /> 进入学生试做
          </button>
        </div>
      </div>
    </section>
  );
}
