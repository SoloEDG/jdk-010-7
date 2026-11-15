import { useCallback, useMemo, useState } from "react";
import type { Kind, LabDocument, TraceResult } from "../../../shared/document";
import type {
  Course,
  Stage,
  StudentProgress,
} from "../../../shared/course";
import { validateCourse, type ValidationReport } from "../../../shared/courseIO";
import {
  createCourse,
  createStage,
  cloneStage,
  defaultRule,
  uid,
  unlockedKinds,
} from "../../../shared/courseFactory";
import { buildSubmission } from "../../../shared/grading";
import {
  createStudentProgress,
  loadStudentProgress,
  recordSubmission,
  saveStudentProgress,
  saveTeacherDraft,
  workingLayout,
} from "../lib/progress";

export type SessionMode = "free" | "teacher" | "student";

export function useCourseSession() {
  const [mode, setMode] = useState<SessionMode>("free");
  const [course, setCourse] = useState<Course | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [teacherIndex, setTeacherIndex] = useState(0);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [notice, setNotice] = useState("");

  const revalidate = useCallback((next: Course) => {
    const r = validateCourse(next);
    setReport(r);
    return r;
  }, []);

  const updateCourse = useCallback(
    (mutate: (c: Course) => Course) => {
      setCourse((prev) => {
        if (!prev) return prev;
        const next = mutate(structuredClone(prev));
        revalidate(next);
        return next;
      });
    },
    [revalidate],
  );

  /* ---------------- 教师：制作 ---------------- */

  const startAuthoring = useCallback(
    (layout: LabDocument, title = "未命名课程") => {
      const c = createCourse(title, layout);
      setCourse(c);
      setTeacherIndex(0);
      setProgress(null);
      setMode("teacher");
      revalidate(c);
      setNotice("已进入课程制作器");
      return c;
    },
    [revalidate],
  );

  const importCourse = useCallback(
    (text: string): ValidationReport => {
      const r = validateCourse(JSON.parse(text));
      if (!r.ok || !r.course) {
        // 错误阶段不跳过：保留报告供 UI 完整展示，拒绝进入任何模式
        setReport(r);
        setNotice("课程文件校验失败，未载入");
        return r;
      }
      setCourse(structuredClone(r.course));
      setTeacherIndex(0);
      setProgress(loadStudentProgress(r.course.id));
      setMode("teacher");
      setReport(r);
      setNotice(`已导入课程《${r.course.title}》，共 ${r.course.stages.length} 个阶段`);
      return r;
    },
    [],
  );

  const addStage = useCallback(
    (layout: LabDocument) => {
      const newIndex = course?.stages.length ?? 0;
      updateCourse((c) => {
        c.stages.push(createStage(layout, c.stages.length));
        return c;
      });
      setTeacherIndex(newIndex);
    },
    [course?.stages.length, updateCourse],
  );

  const updateStage = useCallback(
    (stageId: string, patch: Partial<Stage>) => {
      updateCourse((c) => {
        c.stages = c.stages.map((s) =>
          s.id === stageId ? { ...s, ...patch } : s,
        );
        return c;
      });
    },
    [updateCourse],
  );

  const updateMeta = useCallback(
    (patch: { title?: string; description?: string }) => {
      updateCourse((c) => ({ ...c, ...patch }));
    },
    [updateCourse],
  );

  const removeStage = useCallback(
    (stageId: string) => {
      updateCourse((c) => {
        if (c.stages.length <= 1) return c;
        c.stages = c.stages.filter((s) => s.id !== stageId);
        return c;
      });
      setTeacherIndex((i) => Math.max(0, i - 1));
    },
    [updateCourse],
  );

  const duplicateStage = useCallback(
    (stageId: string) => {
      updateCourse((c) => {
        const i = c.stages.findIndex((s) => s.id === stageId);
        if (i < 0) return c;
        c.stages.splice(i + 1, 0, cloneStage(c.stages[i], i + 1));
        return c;
      });
    },
    [updateCourse],
  );

  /** 把教师预览中调整好的当前实验台布局写回阶段定义。 */
  const commitStageLayout = useCallback(
    (stageId: string, layout: LabDocument) => {
      updateCourse((c) => {
        c.stages = c.stages.map((s) =>
          s.id === stageId ? { ...s, layout: structuredClone(layout) } : s,
        );
        return c;
      });
      setNotice("当前布局已写回阶段定义");
    },
    [updateCourse],
  );

  const saveDraft = useCallback(() => {
    if (course) {
      saveTeacherDraft(course);
      setNotice("课程草稿已保存到此浏览器");
    }
  }, [course]);

  /* ---------------- 模式切换 ---------------- */

  const enterStudentMode = useCallback((): boolean => {
    if (!course) return false;
    const r = revalidate(course);
    if (!r.ok) {
      setNotice("课程仍有校验错误，不能进入学生试做");
      return false;
    }
    const p = loadStudentProgress(course.id) ?? createStudentProgress(course);
    setProgress(p);
    setMode("student");
    setNotice("已进入学生试做模式");
    return true;
  }, [course, revalidate]);

  const enterTeacherMode = useCallback(() => {
    if (course) {
      setMode("teacher");
      setNotice("已回到教师预览");
    }
  }, [course]);

  const exitToFree = useCallback(() => {
    setMode("free");
    setCourse(null);
    setProgress(null);
    setReport(null);
    setNotice("已返回自由实验台");
  }, []);

  /* ---------------- 教师预览：自由切换阶段 ---------------- */

  const teacherStage: Stage | null = course?.stages[teacherIndex] ?? null;

  const previewStage = useCallback((index: number) => {
    setTeacherIndex(index);
  }, []);

  /* ---------------- 学生：阶段导航与提交 ---------------- */

  const studentStageIndex = useMemo(() => {
    if (!course || !progress) return 0;
    const i = course.stages.findIndex(
      (s) => s.id === progress.currentStageId,
    );
    return i < 0 ? 0 : i;
  }, [course, progress]);

  const studentStage: Stage | null =
    course?.stages[studentStageIndex] ?? null;

  const allowedKinds = useMemo(() => {
    if (!course || mode !== "student") return null;
    return unlockedKinds(course, studentStageIndex);
  }, [course, mode, studentStageIndex]);

  const isKindAllowed = useCallback(
    (kind: Kind) => (allowedKinds ? allowedKinds.has(kind) : true),
    [allowedKinds],
  );

  const initialStudentDoc = useMemo(() => {
    if (!studentStage || !progress) return null;
    return workingLayout(progress, studentStage.id, studentStage.layout);
  }, [progress, studentStage]);

  const persistWorkingDoc = useCallback(
    (doc: LabDocument) => {
      if (!progress || !studentStage) return;
      // 只写 localStorage，不调用 setProgress：自动保存是高频操作，
      // 触发重渲染会与提交/解锁的状态更新竞争并把 UI 回滚。
      const next = structuredClone(progress);
      next.workingDocs[studentStage.id] = structuredClone(doc);
      saveStudentProgress(next);
    },
    [progress, studentStage],
  );

  const revealHint = useCallback(() => {
    if (!progress || !studentStage) return;
    const shown = progress.hintsRevealed[studentStage.id] ?? 0;
    if (shown >= studentStage.hints.length) return;
    const next = structuredClone(progress);
    next.hintsRevealed[studentStage.id] = shown + 1;
    saveStudentProgress(next);
    setProgress(next);
  }, [progress, studentStage]);

  const submitStage = useCallback(
    (doc: LabDocument, traceResult: TraceResult) => {
      if (!course || !progress || !studentStage) return null;
      // attempts 统一由 recordSubmission 基于历史快照递增，这里传 0 占位
      const submission = buildSubmission(
        studentStage.id,
        studentStage.rules,
        doc,
        traceResult,
        0,
      );
      const next = recordSubmission(progress, submission);
      next.workingDocs[studentStage.id] = structuredClone(doc);
      if (submission.passed) {
        if (!next.completed.includes(studentStage.id))
          next.completed.push(studentStage.id);
        const following = course.stages[studentStageIndex + 1];
        if (following) next.currentStageId = following.id;
      }
      saveStudentProgress(next);
      setProgress(next);
      // 返回带最终次数的快照，供 UI 即时反馈
      return { ...submission, attempts: next.submissions[studentStage.id].attempts };
    },
    [course, progress, studentStage, studentStageIndex],
  );

  const resetStageProgress = useCallback(() => {
    if (!progress || !studentStage || !course) return;
    const next = structuredClone(progress);
    delete next.workingDocs[studentStage.id];
    delete next.submissions[studentStage.id];
    delete next.hintsRevealed[studentStage.id];
    next.currentStageId = studentStage.id;
    saveStudentProgress(next);
    setProgress(next);
  }, [progress, studentStage, course]);

  return {
    mode,
    course,
    report,
    notice,
    setNotice,
    // teacher
    startAuthoring,
    importCourse,
    addStage,
    updateStage,
    updateMeta,
    removeStage,
    duplicateStage,
    commitStageLayout,
    saveDraft,
    teacherIndex,
    teacherStage,
    previewStage,
    enterStudentMode,
    enterTeacherMode,
    exitToFree,
    // student
    progress,
    studentStage,
    studentStageIndex,
    allowedKinds,
    isKindAllowed,
    initialStudentDoc,
    persistWorkingDoc,
    revealHint,
    submitStage,
    resetStageProgress,
    // re-export for convenience
    validate: validateCourse,
    makeRule: defaultRule,
    newId: uid,
  };
}
