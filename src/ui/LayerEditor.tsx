import { deriveDividerLayout, deriveLayerDims } from '../model/derive';
import type { CaseParams, FingerHole } from '../model/params';
import type { Issue } from '../model/validate';
import { useParams } from '../state/store';
import { CheckboxField, SelectField } from './ChoiceFields';
import { NumberField } from './NumberField';

type LayerNumberKey = {
  [K in keyof CaseParams['layer']]: CaseParams['layer'][K] extends number ? K : never;
}[keyof CaseParams['layer']];

const FINGER_OPTIONS: { value: FingerHole; label: string }[] = [
  { value: 'none', label: 'なし' },
  { value: 'circle', label: '丸穴' },
  { value: 'slot', label: '長穴' },
];

/** 中板（高さ方向の仕切り） */
export function LayerEditor({ issues }: { issues: Issue[] }) {
  const params = useParams((s) => s.params);
  const setLayer = useParams((s) => s.setLayer);
  const l = params.layer;
  const issuesFor = (key: string) => issues.filter((i) => i.path === `layer.${key}`);
  const field = (key: LayerNumberKey, label: string, min: number, max: number, step: number) => (
    <NumberField
      key={key}
      label={label}
      value={l[key]}
      min={min}
      max={max}
      step={step}
      onChange={(v) => setLayer(key, v)}
      issues={issuesFor(key)}
    />
  );
  const ld = deriveLayerDims(params);
  const dividersOn = params.dividers.x.enabled || params.dividers.y.enabled;

  return (
    <section className="panel-section">
      <h2>中板（高さ方向の仕切り）</h2>
      <CheckboxField label="中板を入れる" checked={l.enabled} onChange={(v) => setLayer('enabled', v)} />
      {!l.enabled && <p className="hint">ケースを上下 2 段に分ける取り外し式の板です。本体の内側に受けの段を作り、その上に載せます。</p>}
      {l.enabled && (
        <>
          {field('height', '中板の高さ（床面から下面まで）', 2, params.body.innerHeight, 0.5)}
          {field('plateThickness', '中板の厚み', 0.8, 5, 0.1)}
          {field('sideClearance', '壁との隙間（片側）', 0, 1, 0.05)}
          {field('ledgeDepth', '受けの段の奥行き', 0.5, 6, 0.1)}
          {field('ledgeThickness', '受けの段の先端の厚み', 0, 3, 0.1)}
          <SelectField label="指穴（中央）" value={l.fingerHole} options={FINGER_OPTIONS} onChange={(v) => setLayer('fingerHole', v)} />
          {l.fingerHole !== 'none' && field('fingerHoleSize', l.fingerHole === 'circle' ? '指穴の直径' : '指穴の長さ', 5, 60, 0.5)}
          {l.fingerHole === 'slot' && field('fingerHoleWidth', '指穴の幅', 5, 40, 0.5)}
          <p className="hint">
            中板 {ld.plateWidth.toFixed(1)} × {ld.plateDepth.toFixed(1)} mm、段に載る幅 {ld.bearing.toFixed(2)} mm
            {dividersOn && `。縦の仕切りは中板の下の段だけ（高さ ${deriveDividerLayout(params).height.toFixed(1)} mm）`}
          </p>
        </>
      )}
    </section>
  );
}
