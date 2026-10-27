import type { CaseParams } from '../model/params';
import type { Issue } from '../model/validate';
import { useParams } from '../state/store';
import { NumberField } from './NumberField';

type BodyKey = keyof CaseParams['body'];
type PrintKey = keyof CaseParams['print'];

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

const PRINT_FIELDS: FieldDef<PrintKey>[] = [
  { key: 'nozzleDiameter', label: 'ノズル径', min: 0.2, max: 1.0, step: 0.05 },
  { key: 'minWall', label: '最小壁厚', min: 0.4, max: 3, step: 0.1 },
  { key: 'circularSegments', label: '円弧の分割数', min: 16, max: 256, step: 8, unit: '/360°' },
];

export function ParamPanel({ issues }: { issues: Issue[] }) {
  const params = useParams((s) => s.params);
  const setBody = useParams((s) => s.setBody);
  const setPrint = useParams((s) => s.setPrint);
  const issuesFor = (path: string) => issues.filter((i) => i.path === path);

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
