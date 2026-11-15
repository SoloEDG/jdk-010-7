import { useState } from "react";
import type { Kind, LabDocument, Element } from "../../../shared/document";
import { documentUsesAllowedKinds } from "../../../shared/guards";
import { patchDocument } from "../../../shared/commands";
import { loadDocument, saveDocument } from "../lib/storage";

export interface UseDocumentOptions {
  /**
   * 器件授权守卫。任何会改变文档的操作（增/删/改/撤销/重做/外部替换）
   * 一旦产生包含未授权器件类型的文档，整笔操作被拒绝。
   * 这保证学生撤销历史里也不可能出现未授权器件。
   */
  isKindAllowed?: (kind: Kind) => boolean;
  /** 只读模式：教师预览切换阶段以外的全部编辑都被禁用 */
  readOnly?: boolean;
  /** localStorage 持久化键；传 null 表示不由本 hook 持久化 */
  storageKey?: string | null;
}

const DEFAULT_KEY = "lumen-document";

export function useDocument(
  initial: LabDocument,
  options: UseDocumentOptions = {},
) {
  const { isKindAllowed, readOnly = false } = options;
  const storageKey =
    options.storageKey === undefined ? DEFAULT_KEY : options.storageKey;
  const [doc, setDoc] = useState(() =>
    storageKey ? loadDocument(storageKey) ?? initial : initial,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [past, setPast] = useState<LabDocument[]>([]);
  const [future, setFuture] = useState<LabDocument[]>([]);
  const [saved, setSaved] = useState(false);
  const [lastRejected, setLastRejected] = useState(false);

  function authorized(next: LabDocument): boolean {
    if (!isKindAllowed) return true;
    return documentUsesAllowedKinds(next, isKindAllowed);
  }

  function replace(next: LabDocument): boolean {
    if (readOnly || !authorized(next)) {
      setLastRejected(true);
      return false;
    }
    setPast((p) => [...p.slice(-49), doc]);
    setFuture([]);
    setDoc(next);
    setSaved(false);
    setLastRejected(false);
    return true;
  }

  /**
   * 阶段切换/课程导入时使用：清空撤销栈，使学生无法通过撤销
   * 回到上一阶段（含未授权器件）的布局。
   */
  function reset(next: LabDocument) {
    setPast([]);
    setFuture([]);
    setDoc(next);
    setSelected(null);
    setSaved(false);
    setLastRejected(false);
  }

  return {
    doc,
    selected,
    setSelected,
    saved,
    readOnly,
    /** 最近一次操作是否因授权/只读被拒绝（UI 可据此提示） */
    lastRejected,
    replace,
    reset,
    update: (id: string, p: Partial<Element>) =>
      replace(patchDocument(doc, id, p)),
    remove: (id: string) => {
      if (replace({ ...doc, items: doc.items.filter((e) => e.id !== id) }))
        setSelected(null);
    },
    save: () => {
      if (storageKey) {
        saveDocument(doc, storageKey);
        setSaved(true);
      }
    },
    undo: () => {
      const prev = past.at(-1);
      // 即使历史栈被异常污染，授权守卫仍然兜底拦截
      if (prev && !readOnly && authorized(prev)) {
        setFuture((f) => [doc, ...f]);
        setDoc(prev);
        setPast((p) => p.slice(0, -1));
        setSaved(false);
      }
    },
    redo: () => {
      const next = future[0];
      if (next && !readOnly && authorized(next)) {
        setPast((p) => [...p, doc]);
        setDoc(next);
        setFuture((f) => f.slice(1));
        setSaved(false);
      }
    },
    canUndo: past.length > 0 && !readOnly,
    canRedo: future.length > 0 && !readOnly,
  };
}
