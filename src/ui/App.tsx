import { useRef, useState } from 'react';
import { deriveDims } from '../model/derive';
import { meshToStl } from '../export/stl';
import { useParams } from '../state/store';
import { downloadBlob, fmt } from './files';
import { ParamPanel } from './ParamPanel';
import { useGeometry } from './useGeometry';
import { Viewer, type ViewOptions } from './Viewer';

export function App() {
  const params = useParams((s) => s.params);
  const replace = useParams((s) => s.replace);
  const reset = useParams((s) => s.reset);
  const { result, issues, buildError, busy, elapsedMs } = useGeometry(params);
  const dims = deriveDims(params);
  const fileInput = useRef<HTMLInputElement>(null);

  const [sectionOn, setSectionOn] = useState(false);
  const [sectionY, setSectionY] = useState(0);
  const [showEdges, setShowEdges] = useState(true);
  const view: ViewOptions = { sectionY: sectionOn ? sectionY : null, showEdges };

  const b = params.body;
  const baseName = `case_${fmt(b.innerWidth)}x${fmt(b.innerDepth)}x${fmt(b.innerHeight)}`;
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const exportDisabled = !result || errors.length > 0 || busy;

  const exportStl = (name: string) => {
    const part = result?.parts.find((p) => p.name === name);
    if (!part) return;
    downloadBlob(new Blob([meshToStl(part.mesh, `${baseName}_${name}`)], { type: 'model/stl' }), `${baseName}_${name}.stl`);
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
            {result?.parts.map((part) => (
              <button key={part.name} className="primary" disabled={exportDisabled} onClick={() => exportStl(part.name)}>
                {part.label} STL
              </button>
            ))}
          </div>
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
        </div>
        <div className="status">
          {busy ? '計算中…' : elapsedMs !== null ? `生成 ${elapsedMs.toFixed(0)} ms` : ''}
          {result && ` / 三角形 ${result.parts.reduce((n, p) => n + p.mesh.indices.length / 3, 0).toLocaleString()}`}
          {result && ` / 体積 ${(result.parts[0].volume / 1000).toFixed(1)} cm³`}
        </div>
      </main>
    </div>
  );
}
