import { useEffect, useState } from 'react';
import type { Issue } from '../model/validate';

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** スライダーの範囲。数値入力は範囲外も受け付ける */
  min: number;
  max: number;
  step: number;
  unit?: string;
  issues?: Issue[];
}

/** 数値入力とスライダーの組。入力途中（空欄や "1." など）は確定させない */
export function NumberField({ label, value, onChange, min, max, step, unit = 'mm', issues = [] }: Props) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // text は入力中の文字列なので依存に入れない
  }, [value]);

  const level = issues.some((i) => i.level === 'error')
    ? 'error'
    : issues.length > 0
      ? 'warning'
      : undefined;

  return (
    <div className="field" data-level={level}>
      <label>
        <span className="field-label">{label}</span>
        <span className="field-input">
          <input
            type="number"
            value={text}
            step={step}
            onChange={(e) => {
              setText(e.target.value);
              const v = e.target.valueAsNumber;
              if (Number.isFinite(v)) onChange(v);
            }}
            onBlur={() => setText(String(value))}
          />
          <span className="unit">{unit}</span>
        </span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(Math.max(value, min), max)}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        aria-label={label}
      />
      {issues.map((i, k) => (
        <p key={k} className={`field-issue ${i.level}`}>
          {i.message}
        </p>
      ))}
    </div>
  );
}
