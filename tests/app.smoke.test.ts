/** 冒烟测试：完整挂载 <App/>，验证三种模式的真实渲染不抛出运行时错误。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
});
for (const [k, v] of [
  ["window", dom.window],
  ["document", dom.window.document],
  ["navigator", dom.window.navigator],
  ["HTMLElement", dom.window.HTMLElement],
  ["SVGElement", dom.window.SVGElement],
  ["getComputedStyle", dom.window.getComputedStyle],
  ["DOMPoint", dom.window.DOMPoint],
  ["Blob", dom.window.Blob],
  ["URL", dom.window.URL],
  ["localStorage", dom.window.localStorage],
]) Object.defineProperty(globalThis, k, { value: v, configurable: true });
Object.defineProperty(dom.window, "crypto", { value: globalThis.crypto, configurable: true });
const { MessageChannel } = await import("node:worker_threads");
Object.defineProperty(globalThis, "MessageChannel", { value: MessageChannel, configurable: true });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true });

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");
const { App } = await import("../src/app/App");

function flush() {
  return act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

test("<App/> 挂载自由实验台并可进入课程制作器再返回", async () => {
  const container = document.getElementById("root")!;
  const root = createRoot(container);
  const errors: unknown[] = [];
  window.addEventListener("error", (e) => errors.push(e.error));

  await act(async () => root.render(React.createElement(App)));
  await flush();
  assert.ok(container.querySelector(".bench-svg"), "实验台应渲染");
  assert.ok(container.querySelector(".mission-tabs"), "三个固定任务应保留");
  assert.equal(container.querySelectorAll(".mission-tabs button").length, 3);

  // 进入课程制作
  const authorBtn = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("制作课程"),
  )!;
  await act(async () => authorBtn.dispatchEvent(new dom.window.Event("click", { bubbles: true })));
  await flush();
  assert.ok(container.querySelector(".author-panel"), "制作面板应出现");
  assert.ok(container.querySelector(".stage-tab"), "阶段标签应出现");
  assert.ok(container.querySelector(".validation-box.ok"), "默认课程应校验通过");

  // 在制作器中新增第二个阶段（以当前布局为基础）
  const addStageBtn = [...container.querySelectorAll("button")].find((b) =>
    b.title?.includes("以当前实验台布局新增阶段"),
  )!;
  await act(async () => addStageBtn.dispatchEvent(new dom.window.Event("click", { bubbles: true })));
  await flush();
  assert.equal(container.querySelectorAll(".stage-tab").length, 3, "应有两个阶段加一个新增按钮");

  // 进入教师预览（只读）
  const previewBtn = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("进入预览"),
  )!;
  await act(async () => previewBtn.dispatchEvent(new dom.window.Event("click", { bubbles: true })));
  await flush();
  assert.ok(container.querySelector(".teacher-preview"), "教师预览面板应出现");
  assert.ok(container.querySelector(".bench-svg.read-only"), "实验台应处于只读态");

  // 进入学生试做
  const studentBtn = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("进入学生试做"),
  )!;
  await act(async () => studentBtn.dispatchEvent(new dom.window.Event("click", { bubbles: true })));
  await flush();
  assert.ok(container.querySelector(".student-panel"), "学生面板应出现");
  assert.ok(container.querySelector(".catalog-item.locked"), "应存在锁定器件");
  assert.ok(container.querySelector(".step.locked"), "未来阶段应锁定");

  // 提交：焦点布局直接达标，阶段 1 应标记完成并自动推进到阶段 2
  const submitBtn = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("提交测量结果"),
  )!;
  await act(async () => submitBtn.dispatchEvent(new dom.window.Event("click", { bubbles: true })));
  await flush();
  // 步骤条第一个阶段应为 done，当前阶段推进到第 2 个
  const steps = [...container.querySelectorAll(".step")];
  assert.ok(steps[0].className.includes("done"), "阶段 1 提交通过后应标记完成");
  assert.ok(steps[1].className.includes("current"), "应自动推进到阶段 2");
  const tag = container.querySelector(".student-panel .tag")?.textContent ?? "";
  assert.ok(tag.includes("阶段 2"), tag);

  assert.equal(errors.length, 0, errors.map(String).join(" | "));
  root.unmount();
});
