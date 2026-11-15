import {
  CheckCircle2,
  ChevronRight,
  Lightbulb,
  Lock,
  RotateCcw,
  Send,
  XCircle,
} from "lucide-react";
import {
  comparatorLabels,
  metricLabels,
  metricUnits,
  type Course,
  type Stage,
  type StageSubmission,
  type StudentProgress,
} from "../../../shared/course";
import type { StageVerdict } from "../../../shared/grading";

export interface StudentPanelProps {
  course: Course;
  stage: Stage;
  stageIndex: number;
  progress: StudentProgress;
  verdict: StageVerdict | null;
  lastSubmission: StageSubmission | undefined;
  onSubmit: () => void;
  onRevealHint: () => void;
  onReset: () => void;
  onExitToTeacher: () => void;
}

export function StudentPanel({
  course,
  stage,
  stageIndex,
  progress,
  verdict,
  lastSubmission,
  onSubmit,
  onRevealHint,
  onReset,
  onExitToTeacher,
}: StudentPanelProps) {
  const revealed = progress.hintsRevealed[stage.id] ?? 0;
  const isLast = stageIndex === course.stages.length - 1;
  const passed = progress.completed.includes(stage.id);
  const attempts = lastSubmission?.attempts ?? 0;

  return (
    <section className="student-panel">
      <div className="section-title">
        学生试做 <Lock size={14} />
      </div>

      <div className="stage-stepper">
        {course.stages.map((s, i) => {
          const done = progress.completed.includes(s.id);
          const current = s.id === stage.id;
          return (
            <div
              key={s.id}
              className={`step ${done ? "done" : ""} ${current ? "current" : ""} ${i > stageIndex && !done ? "locked" : ""}`}
              title={
                i > stageIndex && !done
                  ? "尚未解锁的阶段"
                  : s.name
              }
            >
              {i > stageIndex && !done ? (
                <Lock size={11} />
              ) : done ? (
                <CheckCircle2 size={12} />
              ) : (
                <span>{String(i + 1).padStart(2, "0")}</span>
              )}
              {i < course.stages.length - 1 && <ChevronRight size={11} />}
            </div>
          );
        })}
      </div>

      <span className="tag">
        阶段 {stageIndex + 1} / {course.stages.length}
      </span>
      <h2>{stage.name}</h2>
      <p className="stage-brief">{stage.brief}</p>

      <div className="rule-summary">
        <h4>达标条件</h4>
        <ul>
          {stage.rules.map((r) => {
            const live = verdict?.results.find((v) => v.ruleId === r.id);
            return (
              <li key={r.id} className={live?.ok ? "ok" : live ? "bad" : ""}>
                {live?.ok ? (
                  <CheckCircle2 size={12} />
                ) : live ? (
                  <XCircle size={12} />
                ) : (
                  <span className="circle" />
                )}
                <span>
                  {metricLabels[r.metric]} {comparatorLabels[r.comparator]}{" "}
                  {r.value}
                  {metricUnits[r.metric] ? ` ${metricUnits[r.metric]}` : ""}
                  {r.comparator === "approx" &&
                    `（±${r.tolerance ?? 0}${metricUnits[r.metric]}）`}
                </span>
                {live && Number.isFinite(live.actual) && (
                  <small>
                    实测 {live.actual.toFixed(2)}
                    {metricUnits[r.metric]}
                  </small>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="hint-box">
        <h4>
          <Lightbulb size={13} /> 提示
        </h4>
        {stage.hints.length === 0 && <p className="muted">本阶段没有提示。</p>}
        {stage.hints.slice(0, revealed).map((h, i) => (
          <p key={i} className="hint-text">
            {i + 1}. {h}
          </p>
        ))}
        {revealed < stage.hints.length && (
          <button className="ghost-button" onClick={onRevealHint}>
            <Lightbulb size={12} /> 解锁下一条提示（{revealed}/{stage.hints.length}）
          </button>
        )}
      </div>

      <div className="submit-row">
        <button className="save-button" onClick={onSubmit}>
          <Send size={13} /> 提交测量结果
        </button>
        <button className="ghost-button" onClick={onReset} title="恢复本阶段初始布局">
          <RotateCcw size={12} /> 重置阶段
        </button>
      </div>

      <div className={`submission-status ${passed ? "passed" : attempts ? "failed" : ""}`}>
        {passed ? (
          <>
            <CheckCircle2 size={14} />
            {isLast
              ? "全部阶段完成，课程结束"
              : "本阶段通过，已解锁下一阶段的器件与布局"}
          </>
        ) : attempts > 0 ? (
          <>
            <XCircle size={14} />
            第 {attempts} 次提交未达标，根据上方实测值继续调整
          </>
        ) : (
          <span className="muted">调整光路后提交，判定完全在本地离线完成</span>
        )}
      </div>

      <button className="ghost-button exit-teacher" onClick={onExitToTeacher}>
        返回教师预览
      </button>
    </section>
  );
}
