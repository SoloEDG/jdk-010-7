import { ArrowLeftRight, CheckCircle2, Eye, Pencil, Play } from "lucide-react";
import {
  comparatorLabels,
  metricLabels,
  metricUnits,
  type Course,
  type Stage,
} from "../../../shared/course";
import type { StageVerdict } from "../../../shared/grading";

export interface TeacherPreviewProps {
  course: Course;
  stage: Stage;
  stageIndex: number;
  verdict: StageVerdict;
  onSwitchStage: (index: number) => void;
  onEdit: () => void;
  onEnterStudent: () => void;
}

export function TeacherPreviewPanel({
  course,
  stage,
  stageIndex,
  verdict,
  onSwitchStage,
  onEdit,
  onEnterStudent,
}: TeacherPreviewProps) {
  return (
    <section className="teacher-preview">
      <div className="section-title">
        教师预览 <Eye size={15} />
      </div>
      <p className="muted">
        预览可自由切换任意阶段；判定结果与学生提交使用同一计算函数。
      </p>

      <div className="preview-stage-list">
        {course.stages.map((s, i) => (
          <button
            key={s.id}
            className={`preview-stage ${i === stageIndex ? "active" : ""}`}
            onClick={() => onSwitchStage(i)}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {s.name}
            <ArrowLeftRight size={11} className="switch-icon" />
          </button>
        ))}
      </div>

      <span className="tag">
        阶段 {stageIndex + 1} / {course.stages.length}
      </span>
      <h2>{stage.name}</h2>
      <p className="stage-brief">{stage.brief}</p>

      <div className="rule-summary">
        <h4>判定条件与当前实测</h4>
        <ul>
          {stage.rules.map((r) => {
            const v = verdict.results.find((x) => x.ruleId === r.id);
            return (
              <li key={r.id} className={v?.ok ? "ok" : "bad"}>
                {v?.ok ? <CheckCircle2 size={12} /> : <span className="circle" />}
                <span>
                  {metricLabels[r.metric]} {comparatorLabels[r.comparator]} {r.value}
                  {metricUnits[r.metric] ? ` ${metricUnits[r.metric]}` : ""}
                </span>
                <small>
                  {v && Number.isFinite(v.actual)
                    ? `实测 ${v.actual.toFixed(2)}${metricUnits[r.metric]}`
                    : "缺少目标接收屏，不可判定"}
                </small>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={`verdict-banner ${verdict.passed ? "passed" : "pending"}`}>
        {verdict.passed ? (
          <>
            <CheckCircle2 size={14} /> 当前布局满足全部条件
          </>
        ) : (
          <>当前布局尚未达标（仅预览，不会保存学生进度）</>
        )}
      </div>

      <div className="preview-actions">
        <button className="ghost-button" onClick={onEdit}>
          <Pencil size={12} /> 返回制作编辑
        </button>
        <button className="save-button" onClick={onEnterStudent}>
          <Play size={13} /> 进入学生试做
        </button>
      </div>
    </section>
  );
}
