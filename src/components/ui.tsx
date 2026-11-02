import katex from "katex";
import { useMemo, type ReactNode } from "react";

export function Slider(props: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const { label, value, min, max, step, onChange, format } = props;
  return (
    <label className="slider">
      <span className="label">
        <span>{label}</span>
        <span className="value">{format ? format(value) : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}

export function Segmented<T extends string | number>(props: {
  label?: ReactNode;
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="control-group">
      {props.label && <span>{props.label}</span>}
      <div className="segmented" role="radiogroup">
        {props.options.map((o) => (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={o.value === props.value}
            className={o.value === props.value ? "active" : ""}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Inline or display math rendered with KaTeX. */
export function TeX({ children, block = false }: { children: string; block?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(children, { displayMode: block, throwOnError: false }),
    [children, block],
  );
  return block ? (
    <div className="equations" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/** Marks text Maximilian still has to write; lists the points to cover. Only shown in development. */
export function Placeholder({ points }: { points: string[] }) {
  if (import.meta.env.PROD) return null;
  return (
    <div className="placeholder">
      <span className="tag">Text to write</span>
      <ul>
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

export function Readout({ name, value }: { name: ReactNode; value: ReactNode }) {
  return (
    <div className="readout">
      <div className="name">{name}</div>
      <div className="val">{value}</div>
    </div>
  );
}

export function LegendKey({ color, kind = "swatch", label }: { color: string; kind?: "swatch" | "line" | "dash"; label: ReactNode }) {
  return (
    <span className="key">
      {kind === "swatch" ? (
        <span className="swatch" style={{ background: color }} />
      ) : (
        <span className="line" style={{ borderColor: color, borderTopStyle: kind === "dash" ? "dashed" : "solid" }} />
      )}
      {label}
    </span>
  );
}
