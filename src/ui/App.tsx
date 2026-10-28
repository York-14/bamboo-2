import { useRef, useState } from 'react';
import { deriveDims } from '../model/derive';
import type { PartResult } from '../model/mesh';
import { meshToStl, transformMesh } from '../export/stl';
import { useParams } from '../state/store';
import { downloadBlob, fmt } from './files';
import { ParamPanel } from './ParamPanel';
import { useGeometry } from './useGeometry';
import { Viewer, type Layout, type ViewOptions } from './Viewer';

export function App() {
  const params = useParams((s) => s.params);
  const replace = useParams((s) => s.replace);
  const reset = useParams((s) => s.reset);
  const { result, issues, buildError, busy, elapsedMs } = useGeometry(params);
  const dims = deriveDims(params);
  const fileInput = useRef<HTMLInputElement>(null);

  const [layout, setLayout] = useState<Layout>('assembled');
  const [sectionOn, setSectionOn] = useState(false);
  const [sectionY, setSectionY] = useState(0);
  const [showEdges, setShowEdges] = useState(true);
  const [lidOpen, setLidOpen] = useState(0);
  const [lidTranslucent, setLidTranslucent] = useState(false);
  const view: ViewOptions = {
    layout,
    sectionY: sectionOn ? sectionY : null,
    showEdges,
    lidOpen,
    lidTranslucent,
  };

  const b = params.body;
  const baseName = `case_${fmt(b.innerWidth)}x${fmt(b.innerDepth)}x${fmt(b.innerHeight)}`;
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const exportDisabled = !result || errors.length > 0 || busy;
  const mainParts = result?.parts.filter((p) => p.group === 'main') ?? [];
  const couponParts = result?.parts.filter((p) => p.group === 'coupon') ?? [];
  const hasLid = !!result?.lidSlide;

  // STL は印刷する向き・位置（Z=0 に接地）で書き出す
  const exportStl = (part: PartResult) => {
    const name = `${baseName}_${part.name}`;
    const mesh = transformMesh(part.mesh, part.printMatrix);
    downloadBlob(new Blob([meshToStl(mesh, name)], { type: 'model/stl' }), `${name}.stl`);
  };

  const saveJson = () => {
    downloadBlob(new Blob([JSON.stringify(params, null, 2)], { type: 'application/json' }), `${baseName}.json`);
  };

  const loadJson = async (file: File) => {
    try {
      replace(JSON.parse(await file.text()));
    } catch {
      alert('JSON を読み込めませんでした');
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <header>
          <h1>Case Generator</h1>
          <p className="subtitle">FDM 向けパラメトリックケース</p>
        </header>

        <ParamPanel issues={issues} />

        <section className="panel-section">
          <h2>外寸（自動計算）</h2>
          <dl className="dims">
            <dt>横</dt><dd>{dims.outerWidth.toFixed(2)} mm</dd>
            <dt>縦</dt><dd>{dims.outerDepth.toFixed(2)} mm</dd>
            <dt>高さ</dt><dd>{dims.outerHeight.toFixed(2)} mm</dd>
            <dt>内側の角の丸み</dt><dd>{dims.innerCornerRadius.toFixed(2)} mm</dd>
          </dl>
        </section>

        {(errors.length > 0 || buildError) && (
          <section className="panel-section notice error">
            <h2>エラー</h2>
            <p>エラーを解消するまで形状は更新されません。</p>
            {buildError && <p>{buildError}</p>}
          </section>
        )}
        {warnings.length > 0 && (
          <section className="panel-section notice warning">
            <h2>警告 {warnings.length} 件</h2>
            <p>出力はできますが、印刷前に確認してください。</p>
          </section>
        )}

        <section className="panel-section">
          <h2>出力</h2>
          <div className="buttons">
            {mainParts.map((part) => (
              <button key={part.name} className="primary" disabled={exportDisabled} onClick={() => exportStl(part)}>
                {part.label} STL
              </button>
            ))}
          </div>
          {couponParts.length > 0 && (
            <>
              <p className="hint">
                嵌合テスト用の小片：同じ溝・隙間・クリック設定の小さなケースです。本番の前に印刷して、フタの固さを確認できます。
              </p>
              <div className="buttons">
                {couponParts.map((part) => (
                  <button key={part.name} disabled={exportDisabled} onClick={() => exportStl(part)}>
                    {part.label} STL
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="buttons">
            <button onClick={saveJson}>JSON 保存</button>
            <button onClick={() => fileInput.current?.click()}>JSON 読み込み</button>
            <button onClick={() => confirm('パラメータを初期値に戻しますか？') && reset()}>初期値に戻す</button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void loadJson(file);
                e.target.value = '';
              }}
            />
          </div>
        </section>
      </aside>

      <main className="viewport">
        <Viewer result={result} view={view} />
        <div className="view-toolbar">
          <div className="segmented" role="group" aria-label="表示">
            <button className={layout === 'assembled' ? 'active' : ''} onClick={() => setLayout('assembled')}>
              組み立て
            </button>
            <button className={layout === 'print' ? 'active' : ''} onClick={() => setLayout('print')}>
              印刷配置
            </button>
          </div>
          <label>
            <input type="checkbox" checked={showEdges} onChange={(e) => setShowEdges(e.target.checked)} /> 輪郭線
          </label>
          <label>
            <input type="checkbox" checked={sectionOn} onChange={(e) => setSectionOn(e.target.checked)} /> 断面表示
          </label>
          {sectionOn && (
            <input
              type="range"
              min={-dims.outerDepth / 2}
              max={dims.outerDepth / 2}
              step={0.5}
              value={sectionY}
              onChange={(e) => setSectionY(e.target.valueAsNumber)}
              aria-label="断面の位置"
            />
          )}
          {hasLid && layout === 'assembled' && (
            <>
              <label>
                <input type="checkbox" checked={lidTranslucent} onChange={(e) => setLidTranslucent(e.target.checked)} /> フタ半透明
              </label>
              <label>
                フタを開く
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={lidOpen}
                  onChange={(e) => setLidOpen(e.target.valueAsNumber)}
                  aria-label="フタの開き具合"
                />
              </label>
            </>
          )}
        </div>
        <div className="status">
          {busy ? '計算中…' : elapsedMs !== null ? `生成 ${elapsedMs.toFixed(0)} ms` : ''}
          {result && ` / 三角形 ${mainParts.reduce((n, p) => n + p.mesh.indices.length / 3, 0).toLocaleString()}`}
          {mainParts.map((p) => ` / ${p.label} ${(p.volume / 1000).toFixed(1)} cm³`).join('')}
        </div>
      </main>
    </div>
  );
}
