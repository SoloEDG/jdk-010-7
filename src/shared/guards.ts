import type { Kind, LabDocument } from "./document";

/**
 * 器件授权的纯函数实现，供 useDocument 与单元测试共用。
 * 学生模式下任何文档形态（包括撤销栈中的历史快照）都必须通过它。
 */
export function documentUsesAllowedKinds(
  doc: LabDocument,
  isKindAllowed: (kind: Kind) => boolean,
): boolean {
  return doc.items.every((e) => isKindAllowed(e.kind));
}
