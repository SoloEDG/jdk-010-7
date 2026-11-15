import { Lock, Plus } from "lucide-react";
import type { Kind } from "../../../shared/document";
import { labels } from "../../../shared/document";
import { catalog } from "../../catalog/model/catalog";

/**
 * 学生模式下的器件目录：未解锁器件可见但禁用（带锁标识，
 * 让学生知道后续会解锁什么），教师/自由模式全部可点。
 */
export function GuardedCatalog({
  allowed,
  readOnly,
  onAdd,
}: {
  allowed: Set<Kind> | null;
  readOnly: boolean;
  onAdd: (kind: Kind) => void;
}) {
  return (
    <section className="catalog">
      <div className="section-title">
        光学器件 <span>{allowed ? `${allowed.size} 类可用` : "05"}</span>
      </div>
      <p className="muted">
        {allowed ? "仅当前阶段已授权的器件可添加" : "点击添加到实验台"}
      </p>
      {catalog.map((c) => {
        const isAllowed = !allowed || allowed.has(c.kind);
        const disabled = readOnly || !isAllowed;
        return (
          <button
            className={`catalog-item ${!isAllowed ? "locked" : ""}`}
            key={c.kind}
            disabled={disabled}
            onClick={() => onAdd(c.kind)}
            title={!isAllowed ? "该器件尚未解锁" : c.subtitle}
          >
            <span className={"device-icon " + c.kind}>{c.symbol}</span>
            <span>
              <strong>{labels[c.kind]}</strong>
              <small>{isAllowed ? c.subtitle : "完成前置阶段后解锁"}</small>
            </span>
            {isAllowed ? <Plus size={14} /> : <Lock size={13} />}
          </button>
        );
      })}
    </section>
  );
}
