import { deriveDims } from '../model/derive';
import { ignoresRotation, isWallFace, usesHeight } from '../model/holes';
import type { HoleFace, HoleParams, HoleShape } from '../model/params';
import type { Issue } from '../model/validate';
import { useParams } from '../state/store';
import { SelectField } from './ChoiceFields';
import { NumberField } from './NumberField';

export const FACE_OPTIONS: { value: HoleFace; label: string }[] = [
  { value: 'front', label: '手前の壁（−Y）' },
  { value: 'back', label: '奥の壁（+Y）' },
  { value: 'left', label: '左の壁（−X）' },
  { value: 'right', label: '右の壁（+X）' },
  { value: 'bottom', label: '底面' },
  { value: 'lid', label: 'フタ' },
];

const SHAPE_OPTIONS: { value: HoleShape; label: string }[] = [
  { value: 'circle', label: '円' },
  { value: 'teardrop', label: 'ティアドロップ' },
  { value: 'rect', label: '長方形' },
  { value: 'roundRect', label: '角丸長方形' },
  { value: 'slot', label: '長穴' },
  { value: 'hexagon', label: '六角形' },
];

function widthLabel(shape: HoleShape): string {
  if (shape === 'circle' || shape === 'teardrop') return '直径';
  if (shape === 'hexagon') return '対辺の幅';
  return '幅';
}

function summary(h: HoleParams): string {
  const face = FACE_OPTIONS.find((f) => f.value === h.face)!.label.replace(/（.*）/, '');
  const shape = SHAPE_OPTIONS.find((s) => s.value === h.shape)!.label;
  const size = usesHeight(h) ? `${h.width}×${h.height}` : `${h.width}`;
  const count = h.pattern.cols * h.pattern.rows;
  return `${face}・${shape} ${size}${count > 1 ? `（${h.pattern.cols}×${h.pattern.rows}）` : ''}`;
}

export function HoleEditor({ hole, index, issues }: { hole: HoleParams; index: number; issues: Issue[] }) {
  const params = useParams((s) => s.params);
  const updateHole = useParams((s) => s.updateHole);
  const duplicateHole = useParams((s) => s.duplicateHole);
  const removeHole = useParams((s) => s.removeHole);
  const set = (patch: Partial<HoleParams>) => updateHole(hole.id, patch);
  const setPattern = (patch: Partial<HoleParams['pattern']>) => set({ pattern: { ...hole.pattern, ...patch } });

  const d = deriveDims(params);
  const wall = isWallFace(hole.face);
  const uHalf = (hole.face === 'left' || hole.face === 'right' ? d.outerDepth : d.outerWidth) / 2;
  const level = issues.some((i) => i.level === 'error') ? 'error' : issues.length > 0 ? 'warning' : undefined;

  return (
    <details className="hole-card" data-level={level} open>
      <summary>
        <span>
          穴 {index + 1}：{summary(hole)}
        </span>
      </summary>
      <SelectField label="面" value={hole.face} options={FACE_OPTIONS} onChange={(face) => set({ face })} />
      <SelectField label="形状" value={hole.shape} options={SHAPE_OPTIONS} onChange={(shape) => set({ shape })} />
      <NumberField
        label={wall ? '横位置（外から見て右が＋）' : 'X 位置（中心から）'}
        value={hole.u}
        min={-uHalf}
        max={uHalf}
        step={0.5}
        onChange={(u) => set({ u })}
      />
      <NumberField
        label={wall ? '中心の高さ（底面から）' : 'Y 位置（中心から）'}
        value={hole.v}
        min={wall ? 0 : -d.outerDepth / 2}
        max={wall ? d.outerHeight : d.outerDepth / 2}
        step={0.5}
        onChange={(v) => set({ v })}
      />
      <NumberField label={widthLabel(hole.shape)} value={hole.width} min={1} max={60} step={0.5} onChange={(width) => set({ width })} />
      {usesHeight(hole) && (
        <NumberField label="穴の高さ" value={hole.height} min={1} max={60} step={0.5} onChange={(height) => set({ height })} />
      )}
      {hole.shape === 'roundRect' && (
        <NumberField
          label="角の丸み"
          value={hole.cornerRadius}
          min={0}
          max={10}
          step={0.5}
          onChange={(cornerRadius) => set({ cornerRadius })}
        />
      )}
      {!ignoresRotation(hole) && (
        <NumberField label="回転" value={hole.rotation} min={-90} max={90} step={5} unit="°" onChange={(rotation) => set({ rotation })} />
      )}
      <div className="pattern-row">
        <NumberField label="横の個数" value={hole.pattern.cols} min={1} max={20} step={1} unit="個" onChange={(cols) => setPattern({ cols })} />
        <NumberField label="縦の個数" value={hole.pattern.rows} min={1} max={20} step={1} unit="個" onChange={(rows) => setPattern({ rows })} />
      </div>
      {hole.pattern.cols > 1 && (
        <NumberField label="横の間隔" value={hole.pattern.pitchU} min={1} max={60} step={0.5} onChange={(pitchU) => setPattern({ pitchU })} />
      )}
      {hole.pattern.rows > 1 && (
        <NumberField label="縦の間隔" value={hole.pattern.pitchV} min={1} max={60} step={0.5} onChange={(pitchV) => setPattern({ pitchV })} />
      )}
      {issues.map((i, k) => (
        <p key={k} className={`field-issue ${i.level}`}>
          {i.message}
        </p>
      ))}
      <div className="buttons">
        <button onClick={() => duplicateHole(hole.id)}>複製</button>
        <button onClick={() => removeHole(hole.id)}>削除</button>
      </div>
    </details>
  );
}

export function HoleList({ issues }: { issues: Issue[] }) {
  const holes = useParams((s) => s.params.holes);
  const addHole = useParams((s) => s.addHole);
  return (
    <section className="panel-section">
      <h2>穴</h2>
      {holes.length === 0 && <p className="hint">壁・底面・フタに穴を開けられます。</p>}
      {holes.map((h, i) => (
        <HoleEditor key={h.id} hole={h} index={i} issues={issues.filter((x) => x.path === `holes.${h.id}`)} />
      ))}
      <div className="buttons">
        <button onClick={addHole}>＋ 穴を追加</button>
      </div>
    </section>
  );
}
