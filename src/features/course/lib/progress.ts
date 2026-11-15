import type { LabDocument } from "../../../shared/document";
import type { Course, StageSubmission, StudentProgress } from "../../../shared/course";

/**
 * 进度存储。
 *
 * - 学生进度按课程 id 分键保存，互不覆盖；教师预览使用另一组键，
 *   因此同一份课程在两种模式下分别保存进度。
 * - 自由实验台沿用原有的 lumen-document 键。
 * - 纯前端 localStorage：清浏览器数据即丢失，这是离线方案的固有边界。
 */

const STUDENT_PREFIX = "lumen-student-progress:";
const TEACHER_PREFIX = "lumen-teacher-draft:";

function safeParse<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function loadStudentProgress(
  courseId: string,
): StudentProgress | null {
  const p = safeParse<StudentProgress>(
    localStorage.getItem(STUDENT_PREFIX + courseId),
  );
  if (!p || p.kind !== "lumen-student-progress" || p.courseId !== courseId)
    return null;
  return p;
}

export function saveStudentProgress(progress: StudentProgress) {
  progress.updatedAt = new Date().toISOString();
  localStorage.setItem(
    STUDENT_PREFIX + progress.courseId,
    JSON.stringify(progress),
  );
}

export function createStudentProgress(course: Course): StudentProgress {
  const first = course.stages[0];
  return {
    kind: "lumen-student-progress",
    version: 1,
    courseId: course.id,
    completed: [],
    currentStageId: first.id,
    hintsRevealed: {},
    submissions: {},
    workingDocs: {},
    updatedAt: new Date().toISOString(),
  };
}

/** 教师制作器的课程草稿（含尚未导出的修改）。 */
export function saveTeacherDraft(course: Course) {
  localStorage.setItem(TEACHER_PREFIX + course.id, JSON.stringify(course));
}

/** 学生当前阶段的工作布局；没有保存过则回落到阶段初始布局。 */
export function workingLayout(
  progress: StudentProgress,
  stageId: string,
  fallback: LabDocument,
): LabDocument {
  return progress.workingDocs[stageId]
    ? structuredClone(progress.workingDocs[stageId])
    : structuredClone(fallback);
}

export function recordSubmission(
  progress: StudentProgress,
  submission: StageSubmission,
): StudentProgress {
  const next = structuredClone(progress);
  const prev = next.submissions[submission.stageId];
  next.submissions[submission.stageId] = {
    ...submission,
    attempts: (prev?.attempts ?? 0) + 1,
  };
  return next;
}
