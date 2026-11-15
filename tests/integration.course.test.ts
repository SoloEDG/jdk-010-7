/**
 * 集成测试：在 jsdom 中挂载真实 React 组件，验证
 * 制作 → 导出 → 导入 → 学生试做 → 判定 → 解锁 的完整状态机，
 * 以及授权守卫对未授权器件的拦截。
 *
 * 不依赖真实浏览器布局（jsdom 无 SVG 几何计算），光路 trace 是纯数学，
 * 因此判定链路可以完整运行。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
});
Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", { value: dom.window.HTMLElement, configurable: true });
Object.defineProperty(globalThis, "SVGElement", { value: dom.window.SVGElement, configurable: true });
Object.defineProperty(globalThis, "getComputedStyle", { value: dom.window.getComputedStyle, configurable: true });
Object.defineProperty(globalThis, "DOMPoint", { value: dom.window.DOMPoint, configurable: true });
Object.defineProperty(globalThis, "Blob", { value: dom.window.Blob, configurable: true });
Object.defineProperty(globalThis, "URL", { value: dom.window.URL, configurable: true });
Object.defineProperty(dom.window, "crypto", { value: globalThis.crypto, configurable: true });
Object.defineProperty(globalThis, "localStorage", { value: dom.window.localStorage, configurable: true });
// React 19 通过 MessageChannel 调度
const { MessageChannel } = await import("node:worker_threads");
Object.defineProperty(globalThis, "MessageChannel", { value: MessageChannel, configurable: true });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true });

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");

const { trace } = await import("../src/features/optics/lib/trace");
const { validateCourse, parseCourseFile, serializeCourse } = await import(
  "../src/shared/courseIO"
);
const { createCourse, createStage } = await import("../src/shared/courseFactory");
const { evaluateStage } = await import("../src/shared/grading");
const { useCourseSession } = await import(
  "../src/features/course/model/useCourseSession"
);
const { useDocument } = await import("../src/features/bench/model/useDocument");
const { documentUsesAllowedKinds } = await import("../src/shared/guards");

function flush() {
  return act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const focusedLayout = {
  version: 1 as const,
  items: [
    { id: "s", kind: "source" as const, x: 100, y: 300, angle: 0, size: 100, power: 1, rays: 9, spread: 0, wavelength: 550, focal: 150, index: 1.5 },
    { id: "l", kind: "lens" as const, x: 400, y: 300, angle: 90, size: 200, power: 1, rays: 9, spread: 0, wavelength: 550, focal: 150, index: 1.5 },
    { id: "d", kind: "screen" as const, x: 550, y: 300, angle: 90, size: 200, power: 1, rays: 9, spread: 0, wavelength: 550, focal: 150, index: 1.5 },
  ],
};

// 共享一个持久 root，避免 jsdom 下反复 createRoot/unmount 的调度时序问题
let sharedRoot: ReturnType<typeof createRoot> | null = null;
let sharedContainer: HTMLElement | null = null;

function harness() {
  localStorage.clear();
  if (!sharedRoot || !sharedContainer) {
    sharedContainer = document.createElement("div");
    document.body.appendChild(sharedContainer);
    sharedRoot = createRoot(sharedContainer);
  }
  const root = sharedRoot;
  const refs: {
    session?: ReturnType<typeof useCourseSession>;
    doc?: ReturnType<typeof useDocument>;
  } = {};
  const nonce = Math.random();

  function Probe() {
    const session = useCourseSession();
    const doc = useDocument(focusedLayout, {
      storageKey: null,
      isKindAllowed: session.isKindAllowed,
    });
    refs.session = session;
    refs.doc = doc;
    return React.createElement("div", { "data-nonce": nonce });
  }
  return {
    refs,
    render: async () => {
      await act(async () => {
        root.render(React.createElement(Probe, { key: nonce }));
      });
      await flush();
      await flush();
    },
    // 仅清空引用并等待落定，root 保留给下一个测试重新挂载
    unmount: async () => {
      refs.session = undefined;
      refs.doc = undefined;
      await flush();
    },
  };
}

test("完整工作流：制作课程 → 导出 → 导入校验 → 学生通过后解锁下一阶段", async () => {
  const h = harness();
  await h.render();
  const s = h.refs.session!;

  // 1. 教师基于当前场景建课
  act(() => {
    s.startAuthoring(focusedLayout, "集成测试课程");
  });
  await flush();
  assert.equal(h.refs.session!.mode, "teacher");

  // 2. 配置阶段 1：解锁 lens，达标条件为能量占比 ≥ 0.8
  const c0 = h.refs.session!.course!;
  act(() => {
    h.refs.session!.updateStage(c0.stages[0].id, {
      allowedKinds: ["source", "screen", "lens"],
      unlocks: ["lens"],
      rules: [
        { id: "r1", metric: "energyRatio", comparator: ">=", value: 0.8, screenId: "d" },
      ],
    });
  });
  await flush();

  // 3. 加阶段 2（使用已解锁的 lens，并解锁 mirror）
  act(() => {
    h.refs.session!.addStage(focusedLayout);
  });
  await flush();
  const c1 = h.refs.session!.course!;
  assert.equal(c1.stages.length, 2);
  act(() => {
    h.refs.session!.updateStage(c1.stages[1].id, {
      allowedKinds: ["source", "screen", "lens", "mirror"],
      unlocks: ["mirror"],
      rules: [
        { id: "r2", metric: "rmsRadius", comparator: "<=", value: 5, screenId: "d" },
      ],
    });
  });
  await flush();
  assert.equal(h.refs.session!.report?.ok, true, JSON.stringify(h.refs.session!.report?.issues));

  // 4. 导出为本地文件文本，再走导入解析（模拟离线分发）
  const fileText = serializeCourse(h.refs.session!.course!);
  const reimport = parseCourseFile(fileText);
  assert.equal(reimport.ok, true);
  act(() => h.refs.session!.importCourse(fileText));
  await flush();

  // 5. 进入学生模式
  const entered = h.refs.session!.enterStudentMode();
  await flush();
  assert.equal(entered, true);
  assert.equal(h.refs.session!.mode, "student");
  assert.equal(h.refs.session!.studentStageIndex, 0);

  // 6. 学生阶段 0 的授权集合包含 lens 但不含 mirror/prism
  const allowed = h.refs.session!.allowedKinds!;
  assert.ok(allowed.has("lens"));
  assert.ok(!allowed.has("mirror"));
  assert.ok(!allowed.has("prism"));

  // 7. 授权守卫拒绝引入未授权器件（模拟从撤销历史混入）
  const withPrism = {
    version: 1 as const,
    items: [...focusedLayout.items, { id: "p", kind: "prism" as const, x: 1, y: 1, angle: 90, size: 10, power: 1, rays: 3, spread: 0, wavelength: 550, focal: 10, index: 1.5 }],
  };
  assert.equal(
    documentUsesAllowedKinds(withPrism, h.refs.session!.isKindAllowed),
    false,
  );

  // 8. 用真实光路结果提交：焦点布局应通过阶段 1
  const traceResult = trace(focusedLayout);
  const verdict = evaluateStage(
    h.refs.session!.studentStage!.rules,
    focusedLayout,
    traceResult,
  );
  assert.equal(verdict.passed, true);
  const submission = h.refs.session!.submitStage(focusedLayout, traceResult);
  await flush();
  assert.equal(submission?.passed, true);

  // 9. 进度推进到阶段 2，且 mirror 已在授权集合中
  assert.equal(h.refs.session!.studentStageIndex, 1);
  assert.ok(h.refs.session!.allowedKinds!.has("mirror"));
  assert.ok(h.refs.session!.progress!.completed.includes(c1.stages[0].id));

  // 10. 学生进度已独立写入 localStorage（与教师草稿不同键）
  const saved = JSON.parse(
    localStorage.getItem("lumen-student-progress:" + c1.id)!,
  );
  assert.equal(saved.kind, "lumen-student-progress");
  assert.equal(saved.currentStageId, c1.stages[1].id);

  await h.unmount();
});

test("校验失败的课程不能进入学生模式，错误阶段不被跳过", async () => {
  const course = createCourse("坏课程", focusedLayout);
  course.stages[0].rules = [
    { id: "bad", metric: "energyRatio", comparator: ">=", value: NaN },
  ];
  const report = validateCourse(course);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.message.includes("损坏")));
  assert.equal(report.course, null);
});

test("教师预览与学生提交对同一布局给出一致结论", async () => {
  const result = trace(focusedLayout);
  const rules = [
    { id: "r", metric: "energyRatio", comparator: ">=" as const, value: 0.8, screenId: "d" },
  ];
  const a = evaluateStage(rules, focusedLayout, result);
  const b = evaluateStage(rules, focusedLayout, result);
  assert.equal(a.passed, b.passed);
  assert.deepEqual(a.results, b.results);
});

test("未达标的提交不会推进阶段，且会累计尝试次数", async () => {
  const h = harness();
  await h.render();
  // 始终通过 getter 读取最新一次渲染提交的 session，避免持有过期闭包
  const S = () => h.refs.session!;
  assert.ok(h.refs.session, "harness 渲染后 session 应已挂载");
  act(() => S().startAuthoring(focusedLayout, "失败路径课程"));
  await flush();
  const c = S().course!;
  assert.ok(c, "startAuthoring 后课程应已创建");
  // 设定一个不可能达到的高阈值
  act(() =>
    S().updateStage(c.stages[0].id, {
      rules: [
        { id: "hard", metric: "energyRatio", comparator: ">=", value: 1.5, screenId: "d" },
      ],
    }),
  );
  await flush();
  assert.equal(S().enterStudentMode(), true);
  await flush();

  const result = trace(focusedLayout);
  const sub1 = S().submitStage(focusedLayout, result);
  await flush();
  assert.equal(sub1?.passed, false);
  assert.equal(S().studentStageIndex, 0, "失败后不应推进阶段");
  const sub2 = S().submitStage(focusedLayout, result);
  await flush();
  assert.equal(sub2?.attempts, 2, "尝试次数应累加");
  assert.equal(S().progress!.completed.length, 0);
  await h.unmount();
});
