import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sun,
  Undo2,
  Redo2,
  Save,
  Grid2X2,
  MousePointer2,
  Move,
  Info,
  FlaskConical,
  GraduationCap,
  FolderOpen,
  FileUp,
  Lock,
} from "lucide-react";
import { Inspector, createElement } from "../features/catalog";
import { CatalogPanel } from "../features/catalog/ui/CatalogPanel";
import { Bench, ObjectList, useDocument } from "../features/bench";
import { useOptics, RayLayer, OpticsControls } from "../features/optics";
import { useDetector, DetectorPanel } from "../features/detector";
import { useMission, MissionPanel, initialDocument } from "../features/missions";
import { useCourseSession } from "../features/course/model/useCourseSession";
import { CourseAuthorPanel } from "../features/course/ui/CourseAuthorPanel";
import { StudentPanel } from "../features/course/ui/StudentPanel";
import { TeacherPreviewPanel } from "../features/course/ui/TeacherPreviewPanel";
import { GuardedCatalog } from "../features/course/ui/GuardedCatalog";
import { evaluateStage } from "../shared/grading";
import { serializeCourse, parseCourseFile } from "../shared/courseIO";
import { downloadTextFile, pickTextFile } from "../features/course/lib/files";

type TeacherView = "edit" | "preview";

export function App() {
  const session = useCourseSession();
  const { mode, course } = session;
  const [teacherView, setTeacherView] = useState<TeacherView>("edit");
  const [grid, setGrid] = useState(true);
  const [help, setHelp] = useState(false);
  const [notice, setNotice] = useState("");
  const [importIssues, setImportIssues] = useState<string[] | null>(null);

  const readOnly = mode === "teacher" && teacherView === "preview";
  const allowedKinds = mode === "student" ? session.allowedKinds : null;

  const state = useDocument(initialDocument, {
    // 自由模式保存到默认键；课程模式下 save() 仍可手动保存，
    // 但阶段切换走 reset()，不会与学生进度键冲突
    readOnly,
    isKindAllowed: session.isKindAllowed,
  });
  const optics = useOptics(state.doc);
  const detector = useDetector(state.doc, optics.result);
  const mission = useMission(state.doc, optics.result);
  const selected = state.doc.items.find((e) => e.id === state.selected);

  /* 学生工作布局自动保存（与教师草稿分键，互不影响）。
     跳过每次阶段载入后的首帧，避免把初始布局当成学生改动保存。 */
  const skipNextAutosave = useRef(false);

  /* 当前生效的阶段定义（教师随制作器实时变化，学生来自载入的课程） */
  const activeStage =
    mode === "teacher"
      ? session.teacherStage
      : mode === "student"
        ? session.studentStage
        : null;

  /* 教师预览 / 学生面板共用同一判定引擎，保证测量结论一致 */
  const stageVerdict = useMemo(() => {
    if (!activeStage) return null;
    return evaluateStage(activeStage.rules, state.doc, optics.result);
  }, [activeStage, state.doc, optics.result]);

  /* 教师切换预览/编辑阶段：只改索引，实验台布局由下方统一 effect 重置，
     避免同一阶段被 reset 两次（也保证撤销栈只清空一次）。 */
  function loadTeacherStage(index: number) {
    session.previewStage(index);
  }

  /* 模式/阶段变化时把实验台重置为对应布局，撤销栈一并清空 */
  useEffect(() => {
    skipNextAutosave.current = true;
    if (mode === "teacher" && course) {
      const idx = Math.min(session.teacherIndex, course.stages.length - 1);
      state.reset(structuredClone(course.stages[idx].layout));
    } else if (mode === "student" && session.initialStudentDoc) {
      state.reset(structuredClone(session.initialStudentDoc));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, course?.id, session.teacherIndex, session.studentStage?.id]);

  /* 学生工作布局自动保存（与教师草稿分键，互不影响）。
     - 阶段载入后的首帧跳过，避免把初始布局当成学生改动；
     - 提交由 submitStage 自行持久化，也跳过一帧，避免重复 setProgress 覆盖。 */
  useEffect(() => {
    if (mode === "student" && session.studentStage) {
      if (skipNextAutosave.current) {
        skipNextAutosave.current = false;
        return;
      }
      session.persistWorkingDoc(state.doc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.doc, mode]);

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 3200);
  }

  async function handleImport() {
    try {
      const text = await pickTextFile();
      const report = parseCourseFile(text);
      if (!report.ok || !report.course) {
        // 错误阶段不允许悄悄跳过：弹窗列出全部问题，课程不载入
        setImportIssues(report.issues.map((i) => i.message));
        return;
      }
      session.importCourse(text);
      setTeacherView("edit");
      flash(`已导入课程，共 ${report.course.stages.length} 个阶段`);
    } catch (err) {
      setImportIssues([(err as Error).message]);
    }
  }

  function handleExport() {
    if (!course) return;
    const report = session.validate(course);
    if (!report.ok) {
      setImportIssues(report.issues.map((i) => i.message));
      return;
    }
    const safeName = course.title.replace(/[\\/:*?"<>|\s]+/g, "_") || "course";
    downloadTextFile(`${safeName}.lumen-course.json`, serializeCourse(course));
    flash("课程文件已下载，可离线分发给学生");
  }

  function handleAdd(kind: (typeof state.doc.items)[number]["kind"]) {
    if (allowedKinds && !allowedKinds.has(kind)) {
      flash("该器件尚未在当前阶段解锁");
      return;
    }
    if (state.doc.items.length >= 80) {
      flash("场景最多容纳 80 个器件");
      return;
    }
    const e = createElement(kind, state.doc.items.length);
    const ok = state.replace({ ...state.doc, items: [...state.doc.items, e] });
    if (ok) state.setSelected(e.id);
    else flash("操作被器件授权拦截");
  }

  function handleSubmit() {
    // 提交内部已持久化工作布局与进度，抑制紧随其后的自动保存一帧，
    // 防止两个 setProgress 在同一次渲染中互相覆盖
    skipNextAutosave.current = true;
    const submission = session.submitStage(state.doc, optics.result);
    if (!submission) {
      skipNextAutosave.current = false;
      return;
    }
    if (submission.passed) flash("提交通过，正在进入下一阶段…");
    else flash("提交未达标，请对照实测值调整后再次提交");
  }

  const modeLabel =
    mode === "free"
      ? "自由实验台"
      : mode === "teacher"
        ? teacherView === "edit"
          ? "教师 · 课程制作"
          : "教师 · 阶段预览"
        : "学生 · 试做";

  return (
    <div className="app-shell">
      <header>
        <a className="brand" href="./">
          <span className="brand-mark">
            <Sun size={23} />
          </span>
          LUMEN
          <span className="brand-divider" />
          <small>光学实验室</small>
        </a>
        <div className="document-title">
          {mode === "free" ? "未命名实验" : course?.title}
          <span className={`mode-badge mode-${mode}`}>
            {mode === "student" && <Lock size={10} />}
            {mode === "teacher" && <GraduationCap size={10} />}
            {modeLabel}
          </span>
        </div>
        <div className="header-actions">
          <button title="撤销" disabled={!state.canUndo} onClick={state.undo}>
            <Undo2 size={17} />
          </button>
          <button title="重做" disabled={!state.canRedo} onClick={state.redo}>
            <Redo2 size={17} />
          </button>
          <i />
          {mode === "free" && (
            <>
              <button
                className="save-button"
                onClick={() =>
                  session.startAuthoring(state.doc, "基于当前场景的新课程")
                }
                title="把当前实验台场景制作成多阶段课程"
              >
                <GraduationCap size={15} /> 制作课程
              </button>
              <button className="save-button secondary" onClick={handleImport}>
                <FileUp size={15} /> 导入课程
              </button>
              <button
                className="save-button secondary"
                onClick={() => {
                  state.save();
                  flash("实验已保存到此浏览器");
                }}
              >
                <Save size={15} /> 保存
              </button>
            </>
          )}
          {mode === "teacher" && (
            <>
              <button
                className="save-button secondary"
                onClick={() => {
                  setTeacherView(teacherView === "edit" ? "preview" : "edit");
                }}
              >
                <FolderOpen size={15} />
                {teacherView === "edit" ? "进入预览" : "返回编辑"}
              </button>
              <button className="save-button" onClick={handleExport}>
                <Save size={15} /> 导出课程
              </button>
            </>
          )}
          {mode === "student" && (
            <button className="save-button secondary" onClick={session.enterTeacherMode}>
              <GraduationCap size={15} /> 教师预览
            </button>
          )}
        </div>
      </header>

      <div className="workspace-heading">
        <div>
          <span className="eyebrow">
            {mode === "free"
              ? "THE OPTICS PLAYGROUND"
              : mode === "teacher"
                ? "COURSE AUTHORING"
                : "GUIDED EXPERIMENT"}
          </span>
          <h1>
            {mode === "free"
              ? "让光的路径，清晰可见"
              : mode === "teacher"
                ? "把实验设计成可解锁的阶段课程"
                : activeStage?.name ?? "实验进行中"}
            <span>。</span>
          </h1>
        </div>
        <p>
          <i />
          {mode === "student"
            ? `真实光路判定 · 进度仅保存在本机 · 第 ${session.studentStageIndex + 1}/${course?.stages.length ?? 0} 阶段`
            : "二维几何光学 · 实时模拟 · 可离线运行"}
        </p>
      </div>

      <main>
        <aside className="left-sidebar">
          {mode === "free" ? (
            <CatalogPanel onAdd={handleAdd} />
          ) : (
            <GuardedCatalog
              allowed={allowedKinds}
              readOnly={readOnly}
              onAdd={handleAdd}
            />
          )}
          <ObjectList
            doc={state.doc}
            selected={state.selected}
            onSelect={state.setSelected}
          />
        </aside>

        <div className="center">
          <section className="canvas-panel">
            <div className="canvas-toolbar">
              <div className="canvas-label">
                <FlaskConical size={15} />
                {readOnly ? "教师预览（只读）" : "实验台"}
                <span>LIVE</span>
              </div>
              <div className="canvas-tools">
                <OpticsControls
                  visible={optics.visible}
                  normals={optics.normals}
                  onVisible={() => optics.setVisible(!optics.visible)}
                  onNormals={() => optics.setNormals(!optics.normals)}
                />
                <button
                  className={grid ? "enabled" : ""}
                  title="切换网格"
                  onClick={() => setGrid(!grid)}
                >
                  <Grid2X2 size={15} />
                </button>
              </div>
            </div>
            <div className="canvas-container">
              <Bench
                doc={state.doc}
                selected={state.selected}
                onSelect={state.setSelected}
                onUpdate={state.update}
                grid={grid}
                readOnly={readOnly}
              >
                <RayLayer
                  doc={state.doc}
                  result={optics.result}
                  visible={optics.visible}
                  normals={optics.normals}
                />
              </Bench>
              <div className="canvas-badge">
                <MousePointer2 size={13} />
                {readOnly ? "只读预览" : "选择与拖动"}
              </div>
              <div className="scale">
                ━━━━ <span>100 mm</span>
              </div>
            </div>
            <div className="canvas-footer">
              <span>
                <Move size={12} />
                {readOnly
                  ? "预览模式不可编辑器件"
                  : "拖动移动器件"} <i /> 方向键微调
              </span>
              <span>
                {optics.result.segments.length} 段光路 ·{" "}
                {state.doc.items.length} 个器件
              </span>
            </div>
          </section>
          <DetectorPanel
            {...detector}
            onChoose={detector.setChosen}
            onResolution={detector.setResolution}
          />
        </div>

        <aside className="right-sidebar">
          <Inspector
            element={selected}
            readOnly={readOnly}
            onUpdate={(p) => selected && state.update(selected.id, p)}
            onRemove={() => selected && state.remove(selected.id)}
          />
          {mode === "free" && (
            <MissionPanel
              mission={mission.mission}
              evaluation={mission.evaluation}
              onChoose={(id) => {
                state.reset(mission.choose(id));
              }}
            />
          )}
          {mode === "teacher" && course && session.teacherStage && (
            teacherView === "edit" ? (
              <CourseAuthorPanel
                course={course}
                stage={session.teacherStage}
                stageIndex={session.teacherIndex}
                report={session.report}
                currentLayout={state.doc}
                onRenameCourse={(title, description) =>
                  session.updateMeta({ title, description })
                }
                onSelectStage={(i) => loadTeacherStage(i)}
                onAddStage={(layout) => {
                  session.addStage(layout);
                }}
                onDuplicateStage={session.duplicateStage}
                onRemoveStage={session.removeStage}
                onUpdateStage={session.updateStage}
                onCommitLayout={session.commitStageLayout}
                onSaveDraft={session.saveDraft}
                onExport={handleExport}
                onImport={handleImport}
                onPreview={(i) => {
                  loadTeacherStage(i);
                  setTeacherView("preview");
                }}
                onEnterStudent={() => {
                  if (session.enterStudentMode()) setTeacherView("edit");
                }}
              />
            ) : (
              <TeacherPreviewPanel
                course={course}
                stage={session.teacherStage}
                stageIndex={session.teacherIndex}
                verdict={stageVerdict!}
                onSwitchStage={(i) => loadTeacherStage(i)}
                onEdit={() => setTeacherView("edit")}
                onEnterStudent={() => {
                  if (session.enterStudentMode()) setTeacherView("edit");
                }}
              />
            )
          )}
          {mode === "student" && course && session.studentStage && session.progress && (
            <StudentPanel
              course={course}
              stage={session.studentStage}
              stageIndex={session.studentStageIndex}
              progress={session.progress}
              verdict={stageVerdict}
              lastSubmission={session.progress.submissions[session.studentStage.id]}
              onSubmit={handleSubmit}
              onRevealHint={session.revealHint}
              onReset={() => {
                session.resetStageProgress();
                state.reset(structuredClone(session.studentStage!.layout));
              }}
              onExitToTeacher={() => {
                session.enterTeacherMode();
                setTeacherView("preview");
              }}
            />
          )}
        </aside>
      </main>

      <footer>
        <span>
          <i />
          光路计算已更新
          {optics.result.truncated > 0 ? " · 部分光线达到追迹上限" : ""}
        </span>
        <span>{notice || session.notice || "所有实验数据保存在你的浏览器中"}</span>
        <button onClick={() => setHelp(!help)}>
          <Info size={13} />
          使用指南
        </button>
      </footer>

      {importIssues && (
        <div className="modal-backdrop" onClick={() => setImportIssues(null)}>
          <section className="help-modal import-modal" onClick={(e) => e.stopPropagation()}>
            <span className="eyebrow">IMPORT FAILED</span>
            <h2>课程文件校验未通过</h2>
            <p className="muted">
              以下问题必须修复后才能导入，系统不会跳过任何错误阶段：
            </p>
            <ul className="issue-list">
              {importIssues.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
            <button className="save-button" onClick={() => setImportIssues(null)}>
              知道了
            </button>
          </section>
        </div>
      )}

      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section className="help-modal" onClick={(e) => e.stopPropagation()}>
            <span className="eyebrow">QUICK START</span>
            <h2>在光的世界里动手探索</h2>
            <p>1. 自由实验台可随时点击「制作课程」，把当前场景保存为第一阶段。</p>
            <p>2. 教师在制作器中定义阶段、允许器件、解锁器件、提示与测量判定条件。</p>
            <p>3. 导出 .lumen-course.json 离线分发；导入时严格校验缺失器件、循环阶段与损坏条件。</p>
            <p>4. 学生只能看到当前阶段，提交基于真实光路追迹结果，通过后才解锁下一阶段。</p>
            <p>5. 教师预览可自由切换任意阶段且为只读；学生撤销历史无法退回未授权器件。</p>
            <p className="muted">
              安全边界：答案与课程同文件分发，前端只保证学生界面不显示、不写入进度，
              无法阻止主动查看文件的人；需要强保密请改为服务端判分。
            </p>
            <button className="save-button" onClick={() => setHelp(false)}>
              开始探索
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
