import type {
  CaseParams,
  DividerHeightMode,
  DividerMode,
  EntrySide,
  LidCornerMode,
  NotchShape,
} from '../model/params';
import { deriveDividerLayout } from '../model/derive';
import type { Issue } from '../model/validate';
import { useParams } from '../state/store';
import { CheckboxField, SelectField } from './ChoiceFields';
import { NumberField } from './NumberField';
import { PositionsField } from './PositionsField';
import { HoleList } from './HoleEditor';
import { RetainerList } from './RetainerEditor';
import { LayerEditor } from './LayerEditor';

type BodyKey = keyof CaseParams['body'];
type PrintKey = keyof CaseParams['print'];
type LidNumberKey = {
  [K in keyof CaseParams['lid']]: CaseParams['lid'][K] extends number ? K : never;
}[keyof CaseParams['lid']];

type DividerNumberKey = {
  [K in keyof CaseParams['dividers']]: CaseParams['dividers'][K] extends number ? K : never;
}[keyof CaseParams['dividers']];

interface FieldDef<K> {
  key: K;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

const BODY_FIELDS: { title: string; fields: FieldDef<BodyKey>[] }[] = [
  {
    title: '内寸',
    fields: [
      { key: 'innerWidth', label: '横', min: 10, max: 250, step: 0.5 },
      { key: 'innerDepth', label: '縦', min: 10, max: 250, step: 0.5 },
      { key: 'innerHeight', label: '高さ', min: 5, max: 200, step: 0.5 },
    ],
  },
  {
    title: '厚み・形状',
    fields: [
      { key: 'wallThickness', label: '壁厚', min: 0.8, max: 6, step: 0.1 },
      { key: 'bottomThickness', label: '底厚', min: 0.8, max: 6, step: 0.1 },
      { key: 'cornerRadius', label: '角の丸み', min: 0, max: 30, step: 0.5 },
      { key: 'bottomChamfer', label: '底面の面取り', min: 0, max: 3, step: 0.1 },
    ],
  },
];

const LID_FIELDS: FieldDef<LidNumberKey>[] = [
  { key: 'thickness', label: 'フタ厚', min: 1, max: 5, step: 0.1 },
  { key: 'grooveDepth', label: '溝の深さ', min: 0.4, max: 3, step: 0.1 },
  { key: 'sideClearance', label: '横方向の隙間（片側）', min: 0, max: 0.8, step: 0.05 },
  { key: 'verticalClearance', label: '厚み方向の隙間', min: 0, max: 0.8, step: 0.05 },
];

const CLICK_FIELDS: FieldDef<LidNumberKey>[] = [
  { key: 'clickInterference', label: '引っかかり量', min: 0.1, max: 1, step: 0.05 },
  { key: 'clickDiameter', label: '凸の直径', min: 1, max: 4, step: 0.1 },
];

const PRINT_FIELDS: FieldDef<PrintKey>[] = [
  { key: 'nozzleDiameter', label: 'ノズル径', min: 0.2, max: 1.0, step: 0.05 },
  { key: 'minWall', label: '最小壁厚', min: 0.4, max: 3, step: 0.1 },
  { key: 'circularSegments', label: '円弧の分割数', min: 16, max: 256, step: 8, unit: '/360°' },
  { key: 'holeCompensation', label: '穴の寸法補正', min: 0, max: 0.6, step: 0.05 },
];

const CORNER_MODE_OPTIONS: { value: LidCornerMode; label: string }[] = [
  { value: 'match', label: '本体に合わせる' },
  { value: 'reduced', label: '個別に指定' },
];

const DIVIDER_MODE_OPTIONS: { value: DividerMode; label: string }[] = [
  { value: 'equal', label: '等分' },
  { value: 'custom', label: '位置を指定' },
];

const HEIGHT_MODE_OPTIONS: { value: DividerHeightMode; label: string }[] = [
  { value: 'full', label: '上まで' },
  { value: 'custom', label: '高さを指定' },
];

const NOTCH_OPTIONS: { value: NotchShape; label: string }[] = [
  { value: 'none', label: 'なし' },
  { value: 'u', label: 'U 字' },
  { value: 'v', label: 'V 字' },
];

function DividerSetEditor({
  axis,
  title,
  positionsLabel,
  issuesFor,
}: {
  axis: 'x' | 'y';
  title: string;
  positionsLabel: string;
  issuesFor: (path: string) => Issue[];
}) {
  const set = useParams((s) => s.params.dividers[axis]);
  const setDividerSet = useParams((s) => s.setDividerSet);
  return (
    <>
      <CheckboxField label={title} checked={set.enabled} onChange={(v) => setDividerSet(axis, 'enabled', v)} />
      {set.enabled && (
        <div className="subgroup">
          <SelectField
            label="分け方"
            value={set.mode}
            options={DIVIDER_MODE_OPTIONS}
            onChange={(v) => setDividerSet(axis, 'mode', v)}
          />
          {set.mode === 'equal' ? (
            <NumberField
              label="区画数"
              value={set.divisions}
              min={1}
              max={10}
              step={1}
              unit="区画"
              onChange={(v) => setDividerSet(axis, 'divisions', v)}
              issues={issuesFor(`dividers.${axis}.divisions`)}
            />
          ) : (
            <PositionsField
              label={positionsLabel}
              values={set.positions}
              onChange={(v) => setDividerSet(axis, 'positions', v)}
              issues={issuesFor(`dividers.${axis}.positions`)}
            />
          )}
        </div>
      )}
    </>
  );
}

function entryOptions(p: CaseParams): { value: EntrySide; label: string }[] {
  // 横（X）が長ければ ±X 側の壁が短辺
  const xIsShort = p.body.innerWidth >= p.body.innerDepth;
  const tag = (alongX: boolean) => (alongX === xIsShort ? '・短辺' : '・長辺');
  return [
    { value: '-x', label: `左（−X${tag(true)}）` },
    { value: '+x', label: `右（+X${tag(true)}）` },
    { value: '-y', label: `手前（−Y${tag(false)}）` },
    { value: '+y', label: `奥（+Y${tag(false)}）` },
  ];
}

export function ParamPanel({ issues }: { issues: Issue[] }) {
  const params = useParams((s) => s.params);
  const setBody = useParams((s) => s.setBody);
  const setLid = useParams((s) => s.setLid);
  const setPrint = useParams((s) => s.setPrint);
  const issuesFor = (path: string) => issues.filter((i) => i.path === path);
  const lid = params.lid;
  const dividers = params.dividers;
  const setDividers = useParams((s) => s.setDividers);

  const dividerNumberField = (f: FieldDef<DividerNumberKey>) => (
    <NumberField
      key={f.key}
      label={f.label}
      min={f.min}
      max={f.max}
      step={f.step}
      unit={f.unit}
      value={dividers[f.key]}
      onChange={(v) => setDividers(f.key, v)}
      issues={issuesFor(`dividers.${f.key}`)}
    />
  );

  const lidNumberField = (f: FieldDef<LidNumberKey>) => (
    <NumberField
      key={f.key}
      label={f.label}
      min={f.min}
      max={f.max}
      step={f.step}
      unit={f.unit}
      value={lid[f.key]}
      onChange={(v) => setLid(f.key, v)}
      issues={issuesFor(`lid.${f.key}`)}
    />
  );

  return (
    <>
      {BODY_FIELDS.map((group) => (
        <section key={group.title} className="panel-section">
          <h2>{group.title}</h2>
          {group.fields.map((f) => (
            <NumberField
              key={f.key}
              label={f.label}
              min={f.min}
              max={f.max}
              step={f.step}
              unit={f.unit}
              value={params.body[f.key]}
              onChange={(v) => setBody(f.key, v)}
              issues={issuesFor(`body.${f.key}`)}
            />
          ))}
        </section>
      ))}

      <section className="panel-section">
        <h2>スライドフタ</h2>
        <CheckboxField label="フタを付ける" checked={lid.enabled} onChange={(v) => setLid('enabled', v)} />
        {lid.enabled && (
          <>
            <SelectField
              label="差し込む側"
              value={lid.entrySide}
              options={entryOptions(params)}
              onChange={(v) => setLid('entrySide', v)}
            />
            {LID_FIELDS.map(lidNumberField)}
            <SelectField
              label="フタの角"
              value={lid.cornerMode}
              options={CORNER_MODE_OPTIONS}
              onChange={(v) => setLid('cornerMode', v)}
            />
            {lid.cornerMode === 'reduced' &&
              lidNumberField({ key: 'cornerRadius', label: 'フタの角の丸み', min: 0, max: 20, step: 0.5 })}
            <CheckboxField
              label="クリック（閉じた位置で留める）"
              checked={lid.clickEnabled}
              onChange={(v) => setLid('clickEnabled', v)}
            />
            {lid.clickEnabled && CLICK_FIELDS.map(lidNumberField)}
          </>
        )}
      </section>

      <section className="panel-section">
        <h2>仕切り</h2>
        <DividerSetEditor axis="x" title="横（X）を分割する" positionsLabel="左の壁からの位置" issuesFor={issuesFor} />
        <DividerSetEditor axis="y" title="縦（Y）を分割する" positionsLabel="手前の壁からの位置" issuesFor={issuesFor} />
        {(dividers.x.enabled || dividers.y.enabled) && (
          <>
            {dividerNumberField({ key: 'thickness', label: '厚み', min: 0.8, max: 4, step: 0.1 })}
            <SelectField
              label="高さ"
              value={dividers.heightMode}
              options={HEIGHT_MODE_OPTIONS}
              onChange={(v) => setDividers('heightMode', v)}
            />
            {dividers.heightMode === 'full'
              ? lid.enabled && dividerNumberField({ key: 'topClearance', label: 'フタとの隙間', min: 0.2, max: 5, step: 0.1 })
              : dividerNumberField({ key: 'height', label: '仕切りの高さ', min: 2, max: Math.max(params.body.innerHeight, 2), step: 0.5 })}
            <p className="hint">仕切りの高さ（底面から）: {deriveDividerLayout(params).height.toFixed(1)} mm</p>
            <SelectField
              label="指を入れる切り欠き"
              value={dividers.notchShape}
              options={NOTCH_OPTIONS}
              onChange={(v) => setDividers('notchShape', v)}
            />
            {dividers.notchShape !== 'none' && (
              <>
                {dividerNumberField({ key: 'notchWidth', label: '切り欠きの幅', min: 4, max: 60, step: 0.5 })}
                {dividerNumberField({ key: 'notchDepth', label: '切り欠きの深さ', min: 2, max: 40, step: 0.5 })}
              </>
            )}
          </>
        )}
      </section>

      <LayerEditor issues={issues} />

      <HoleList issues={issues} />

      <RetainerList issues={issues} />

      <details className="panel-section">
        <summary>
          <h2>印刷設定（FDM）</h2>
        </summary>
        {PRINT_FIELDS.map((f) => (
          <NumberField
            key={f.key}
            label={f.label}
            min={f.min}
            max={f.max}
            step={f.step}
            unit={f.unit}
            value={params.print[f.key]}
            onChange={(v) => setPrint(f.key, f.key === 'circularSegments' ? Math.round(v) : v)}
            issues={issuesFor(`print.${f.key}`)}
          />
        ))}
      </details>
    </>
  );
}
