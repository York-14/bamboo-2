import { useEffect, useState } from 'react';
import type { Issue } from '../model/validate';

/** "30, 60.5" のようなカンマ区切りの数値リスト入力。確定は入力欄から離れたとき・Enter のとき */
export function PositionsField({
  label,
  values,
  onChange,
  issues = [],
}: {
  label: string;
  values: number[];
  onChange: (values: number[]) => void;
  issues?: Issue[];
}) {
  const format = (v: number[]) => v.join(', ');
  const [text, setText] = useState(format(values));
  useEffect(() => setText(format(values)), [values]);

  const commit = () => {
    const parsed = text
      .split(/[,、\s]+/)
      .filter((s) => s !== '')
      .map(Number)
      .filter((n) => Number.isFinite(n));
    onChange(parsed);
    setText(format(parsed));
  };

  const level = issues.some((i) => i.level === 'error') ? 'error' : issues.length > 0 ? 'warning' : undefined;
  return (
    <div className="field" data-level={level}>
      <label>
        <span className="field-label">{label}</span>
        <span className="field-input">
          <input
            type="text"
            className="positions"
            value={text}
            placeholder="例: 30, 60"
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
          />
          <span className="unit">mm</span>
        </span>
      </label>
      {issues.map((i, k) => (
        <p key={k} className={`field-issue ${i.level}`}>
          {i.message}
        </p>
      ))}
    </div>
  );
}
