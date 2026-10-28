import type { RetainerFace, RetainerParams, RetainerType } from '../model/params';
import { innerWallLength } from '../model/retainers';
import type { Issue } from '../model/validate';
import { useParams } from '../state/store';
import { CheckboxField, SelectField } from './ChoiceFields';
import { NumberField } from './NumberField';

const TYPE_LABEL: Record<RetainerType, string> = {
  crushRib: 'つぶしリブ',
  stopper: 'ストッパー',
  shelf: '棚',
};

const TYPE_HINT: Record<RetainerType, string> = {
  crushRib: '縦の細い三角リブ。押し込んだ物をリブがつぶれる力で保持します。',
  stopper: '押し込むと乗り越えて引っかかる爪。上側の斜面がガイドになります。',
  shelf: '板（基板など）を載せる段。下側は斜面なのでサポート不要です。',
};

const WALL_OPTIONS: { value: RetainerFace; label: string }[] = [
  { value: 'front', label: '手前の壁（−Y）' },
  { value: 'back', label: '奥の壁（+Y）' },
  { value: 'left', label: '左の壁（−X）' },
  { value: 'right', label: '右の壁（+X）' },
];

const SHELF_FACE_OPTIONS = [{ value: 'all' as RetainerFace, label: '全周' }, ...WALL_OPTIONS];

function RetainerCard({ r, index, issues }: { r: RetainerParams; index: number; issues: Issue[] }) {
  const params = useParams((s) => s.params);
  const update = useParams((s) => s.updateRetainer);
  const duplicate = useParams((s) => s.duplicateRetainer);
  const remove = useParams((s) => s.removeRetainer);
  const set = (patch: Partial<RetainerParams>) => update(r.id, patch);

  const onWall = r.face !== 'all';
  const wallHalf = onWall ? innerWallLength(params, r.face as Exclude<RetainerFace, 'all'>) / 2 : 0;
  const zMax = params.body.innerHeight;
  const level = issues.some((i) => i.level === 'error') ? 'error' : issues.length > 0 ? 'warning' : undefined;
  const faceLabel = (r.type === 'shelf' ? SHELF_FACE_OPTIONS : WALL_OPTIONS)
    .find((o) => o.value === r.face)
    ?.label.replace(/（.*）/, '');

  return (
    <details className="hole-card" data-level={level} open>
      <summary>
        <span>
          {index + 1}：{TYPE_LABEL[r.type]}・{faceLabel}
        </span>
      </summary>
      <p className="hint">{TYPE_HINT[r.type]}</p>
      <SelectField
        label="面"
        value={r.face}
        options={r.type === 'shelf' ? SHELF_FACE_OPTIONS : WALL_OPTIONS}
        onChange={(face) => set({ face })}
      />

      {r.type !== 'crushRib' && onWall && (
        <CheckboxField label="壁の端から端まで" checked={r.fullLength} onChange={(fullLength) => set({ fullLength })} />
      )}
      {onWall && !(r.type !== 'crushRib' && r.fullLength) && (
        <NumberField
          label="横位置（外から見て右が＋）"
          value={r.u}
          min={-wallHalf}
          max={wallHalf}
          step={0.5}
          onChange={(u) => set({ u })}
        />
      )}
      {r.type !== 'crushRib' && onWall && !r.fullLength && (
        <NumberField label="長さ" value={r.length} min={2} max={Math.max(wallHalf * 2, 2)} step={0.5} onChange={(length) => set({ length })} />
      )}

      {r.type === 'crushRib' && (
        <>
          <NumberField label="下端の高さ（床面から）" value={r.z} min={0} max={zMax} step={0.5} onChange={(z) => set({ z })} />
          <NumberField label="リブの長さ" value={r.ribLength} min={2} max={zMax} step={0.5} onChange={(ribLength) => set({ ribLength })} />
          <NumberField label="突き出し量" value={r.protrusion} min={0.1} max={1.5} step={0.05} onChange={(protrusion) => set({ protrusion })} />
          <NumberField label="根元の幅" value={r.ribBase} min={0.8} max={4} step={0.1} onChange={(ribBase) => set({ ribBase })} />
          <div className="pattern-row">
            <NumberField label="本数" value={r.ribCount} min={1} max={10} step={1} unit="本" onChange={(ribCount) => set({ ribCount })} />
            {r.ribCount > 1 && (
              <NumberField label="間隔" value={r.ribPitch} min={1} max={60} step={0.5} onChange={(ribPitch) => set({ ribPitch })} />
            )}
          </div>
        </>
      )}

      {r.type === 'stopper' && (
        <>
          <NumberField label="爪の先端の高さ（床面から）" value={r.z} min={0} max={zMax} step={0.5} onChange={(z) => set({ z })} />
          <NumberField label="突き出し量" value={r.protrusion} min={0.2} max={4} step={0.1} onChange={(protrusion) => set({ protrusion })} />
          <NumberField label="下側の斜面（壁との角度）" value={r.undersideAngle} min={10} max={80} step={5} unit="°" onChange={(undersideAngle) => set({ undersideAngle })} />
          <NumberField label="上側の斜面（壁との角度）" value={r.topAngle} min={10} max={80} step={5} unit="°" onChange={(topAngle) => set({ topAngle })} />
        </>
      )}

      {r.type === 'shelf' && (
        <>
          <NumberField label="棚の上面の高さ（床面から）" value={r.z} min={0} max={zMax} step={0.5} onChange={(z) => set({ z })} />
          <NumberField label="奥行き（突き出し）" value={r.protrusion} min={0.5} max={10} step={0.5} onChange={(protrusion) => set({ protrusion })} />
          <NumberField label="先端の厚み" value={r.shelfThickness} min={0} max={5} step={0.1} onChange={(shelfThickness) => set({ shelfThickness })} />
          <NumberField label="下側の斜面（壁との角度）" value={r.undersideAngle} min={10} max={80} step={5} unit="°" onChange={(undersideAngle) => set({ undersideAngle })} />
        </>
      )}

      {issues.map((i, k) => (
        <p key={k} className={`field-issue ${i.level}`}>
          {i.message}
        </p>
      ))}
      <div className="buttons">
        <button onClick={() => duplicate(r.id)}>複製</button>
        <button onClick={() => remove(r.id)}>削除</button>
      </div>
    </details>
  );
}

export function RetainerList({ issues }: { issues: Issue[] }) {
  const retainers = useParams((s) => s.params.retainers);
  const add = useParams((s) => s.addRetainer);
  return (
    <section className="panel-section">
      <h2>抜け止め</h2>
      {retainers.length === 0 && <p className="hint">内側の壁に、物を保持する突起を付けられます。</p>}
      {retainers.map((r, i) => (
        <RetainerCard key={r.id} r={r} index={i} issues={issues.filter((x) => x.path === `retainers.${r.id}`)} />
      ))}
      <div className="buttons">
        <button onClick={() => add('crushRib')}>＋ つぶしリブ</button>
        <button onClick={() => add('stopper')}>＋ ストッパー</button>
        <button onClick={() => add('shelf')}>＋ 棚</button>
      </div>
    </section>
  );
}
