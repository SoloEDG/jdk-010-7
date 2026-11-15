import { Trash2, SlidersHorizontal } from "lucide-react";
import { labels, type Element } from "../../../shared/document";
import { parameters } from "../lib/parameters";
export function Inspector({
  element,
  onUpdate,
  onRemove,
  readOnly = false,
}: {
  element?: Element;
  onUpdate: (patch: Partial<Element>) => void;
  onRemove: () => void;
  readOnly?: boolean;
}) {
  if (!element)
    return (
      <section className="inspector">
        <div className="section-title">
          器件属性 <SlidersHorizontal size={15} />
        </div>
        <p className="empty">
          选择实验台上的器件
          <br />
          查看并调整光学参数
        </p>
      </section>
    );
  return (
    <section className="inspector">
      <div className="section-title">
        器件属性 <SlidersHorizontal size={15} />
      </div>
      <div className="selected-name">
        <i />
        {labels[element.kind]}
        <span>已选中</span>
      </div>
      <div className="coordinates">
        {(["x", "y"] as const).map((key) => (
          <label key={key}>
            {key.toUpperCase()}
            <input
              aria-label={key + " 坐标"}
              type="number"
              min="20"
              max={key === "x" ? 980 : 580}
              value={Math.round(element[key])}
              disabled={readOnly}
              onChange={(e) =>
                onUpdate({
                  [key]: Math.max(
                    20,
                    Math.min(key === "x" ? 980 : 580, Number(e.target.value)),
                  ),
                })
              }
            />
            <small>mm</small>
          </label>
        ))}
      </div>
      {parameters(element).map((p) => (
        <label className="parameter" key={p.key}>
          <span>
            {p.label}
            <b>
              {Number(element[p.key]).toFixed(p.step < 1 ? 2 : 0)}{" "}
              <small>{p.unit}</small>
            </b>
          </span>
          <input
            aria-label={p.label}
            type="range"
            min={p.min}
            max={p.max}
            step={p.step}
            value={Number(element[p.key])}
            disabled={readOnly}
            onChange={(e) =>
              onUpdate({
                [p.key]:
                  p.key === "focal" && Number(e.target.value) === 0
                    ? 10
                    : Number(e.target.value),
              })
            }
          />
          <div className="range-label">
            <span>{p.min}</span>
            <span>{p.max}</span>
          </div>
        </label>
      ))}
      <button className="delete" onClick={onRemove} disabled={readOnly}>
        <Trash2 size={14} />
        {readOnly ? "预览模式不可移除器件" : "移除器件"}
      </button>
    </section>
  );
}
