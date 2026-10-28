import { afterEach, describe, expect, it } from 'vitest';
import { buildCase, buildCaseManifolds } from '../../src/model/build';
import { deriveDividerLayout, dividerCenters } from '../../src/model/derive';
import { DEFAULT_PARAMS, type CaseParams, type DividerParams } from '../../src/model/params';
import { Scope } from '../../src/model/geometry/scope';
import { hasError, validate } from '../../src/model/validate';
import { isWatertight, loadWasm } from './helpers';

let scope = new Scope();
afterEach(() => {
  scope.dispose();
  scope = new Scope();
});

const NO_LID: CaseParams = { ...DEFAULT_PARAMS, lid: { ...DEFAULT_PARAMS.lid, enabled: false } };

function withDividers(patch: Partial<DividerParams>, base: CaseParams = NO_LID): CaseParams {
  return { ...base, dividers: { ...base.dividers, notchShape: 'none', ...patch } };
}

const X2 = { enabled: true, mode: 'equal' as const, divisions: 2, positions: [] };
const Y2 = { enabled: true, mode: 'equal' as const, divisions: 2, positions: [] };

async function bodyVolume(p: CaseParams): Promise<number> {
  const wasm = await loadWasm();
  return buildCaseManifolds(wasm, scope, p).body.volume();
}

describe('仕切りの配置計算', () => {
  it('等分では区画の内寸が等しくなる', () => {
    const c = dividerCenters({ enabled: true, mode: 'equal', divisions: 3, positions: [] }, 100, 1.2);
    // 区画 = (100 - 2*1.2) / 3
    const cell = (100 - 2.4) / 3;
    expect(c).toHaveLength(2);
    expect(c[0]).toBeCloseTo(-50 + cell + 0.6, 9);
    expect(c[1]).toBeCloseTo(-50 + 2 * cell + 1.2 + 0.6, 9);
  });

  it('区画数 1 なら仕切りなし', () => {
    expect(dividerCenters({ enabled: true, mode: 'equal', divisions: 1, positions: [] }, 100, 1.2)).toEqual([]);
  });

  it('個別指定はマイナス側の壁からの距離で、順不同でも並べ替える', () => {
    expect(dividerCenters({ enabled: true, mode: 'custom', divisions: 2, positions: [70, 30] }, 100, 1.2)).toEqual([-20, 20]);
  });

  it('格子では、各仕切りが直交する仕切りで区間に分かれる', () => {
    const layout = deriveDividerLayout(withDividers({ x: X2, y: Y2 }));
    const xPlate = layout.placements.find((p) => p.axis === 'x')!;
    const flat = xPlate.segments.flatMap((s) => [s.from, s.to]);
    [-30, -0.6, 0.6, 30].forEach((v, i) => expect(flat[i]).toBeCloseTo(v, 9));
  });

  it('フタありの full モードでは、フタの下面との隙間ぶん低くなる', () => {
    expect(deriveDividerLayout(withDividers({ x: X2 }, DEFAULT_PARAMS)).height).toBeCloseTo(29, 9);
    expect(deriveDividerLayout(withDividers({ x: X2 })).height).toBeCloseTo(30, 9);
  });
});

describe('仕切りの形状', () => {
  const base = withDividers({});

  it('仕切り 1 枚で増える体積は 厚み × 内寸 × 高さ（壁・底への食い込み分は重複）', async () => {
    const v0 = await bodyVolume(base);
    const v1 = await bodyVolume(withDividers({ x: X2 }));
    expect(v1 - v0).toBeCloseTo(1.2 * 60 * 30, 3);
  });

  it('格子では交差部を二重に数えない', async () => {
    const v0 = await bodyVolume(base);
    const v1 = await bodyVolume(withDividers({ x: X2, y: Y2 }));
    expect(v1 - v0).toBeCloseTo(1.2 * 30 * (60 + 100 - 1.2), 3);
  });

  it('V 字の切り欠きは区画ごとに 幅×深さ/2 の面積だけ削る', async () => {
    const plain = await bodyVolume(withDividers({ x: X2 }));
    const notched = await bodyVolume(withDividers({ x: X2, notchShape: 'v', notchWidth: 20, notchDepth: 10 }));
    expect(plain - notched).toBeCloseTo(1.2 * (20 * 10) / 2, 3);
  });

  it('U 字の切り欠きは 長方形 + 半円 の面積だけ削る', async () => {
    const plain = await bodyVolume(withDividers({ x: X2 }));
    const notched = await bodyVolume(withDividers({ x: X2, notchShape: 'u', notchWidth: 20, notchDepth: 12 }));
    const area = 20 * (12 - 10) + (Math.PI * 10 * 10) / 2;
    expect(Math.abs((plain - notched) - 1.2 * area) / (1.2 * area)).toBeLessThan(0.005);
  });

  it('格子の切り欠きは区画ごと（横 2 区画 × 縦 2 区画 → 計 4 か所）', async () => {
    const plain = await bodyVolume(withDividers({ x: X2, y: Y2 }));
    const notched = await bodyVolume(withDividers({ x: X2, y: Y2, notchShape: 'v', notchWidth: 10, notchDepth: 5 }));
    expect(plain - notched).toBeCloseTo(4 * 1.2 * (10 * 5) / 2, 3);
  });

  it('角の丸みが大きく、仕切りが角に近くても外にはみ出さない', async () => {
    const wasm = await loadWasm();
    const p: CaseParams = {
      ...withDividers({ x: { enabled: true, mode: 'custom', divisions: 2, positions: [2] } }),
      body: { ...NO_LID.body, cornerRadius: 15 },
    };
    const plain = buildCaseManifolds(wasm, scope, { ...p, dividers: { ...p.dividers, x: { ...p.dividers.x, enabled: false } } });
    const withDiv = buildCaseManifolds(wasm, scope, p);
    // 外形（凸包）の体積は変わらない
    expect(scope.keep(withDiv.body.hull()).volume()).toBeCloseTo(scope.keep(plain.body.hull()).volume(), 3);
  });

  it('フタ付きでも、仕切りはフタと重ならず、フタは最後まで抜ける', async () => {
    const wasm = await loadWasm();
    const p = withDividers(
      { x: { ...X2, divisions: 3 }, y: Y2, notchShape: 'u' },
      { ...DEFAULT_PARAMS, lid: { ...DEFAULT_PARAMS.lid, clickEnabled: false } },
    );
    const { body, lid } = buildCaseManifolds(wasm, scope, p);
    for (let d = 0; d <= 110; d += 10) {
      const moved = scope.keep(lid!.translate(-d, 0, 0));
      expect(scope.keep(body.intersect(moved)).volume(), `d=${d}`).toBeLessThan(1e-6);
    }
  });

  it('すべての部品が水密', async () => {
    const wasm = await loadWasm();
    const p = withDividers({ x: { ...X2, divisions: 4 }, y: Y2, notchShape: 'u' }, DEFAULT_PARAMS);
    for (const part of buildCase(wasm, p).parts) expect(isWatertight(part.mesh), part.name).toBe(true);
  });

  it('テスト片には仕切りを入れない', async () => {
    const wasm = await loadWasm();
    const withDiv = buildCase(wasm, withDividers({ x: X2 }, DEFAULT_PARAMS));
    const without = buildCase(wasm, DEFAULT_PARAMS);
    const vol = (r: typeof withDiv) => r.parts.find((p) => p.name === 'coupon-body')!.volume;
    expect(vol(withDiv)).toBeCloseTo(vol(without), 6);
  });
});

describe('仕切りの入力検証', () => {
  it('初期値（仕切り有効）ではエラーも警告もない', () => {
    expect(validate(withDividers({ x: X2, y: Y2, notchShape: 'u' }, DEFAULT_PARAMS))).toEqual([]);
  });

  it('フタに当たる高さはエラー', () => {
    const p = withDividers({ x: X2, heightMode: 'custom', height: 29.5 }, DEFAULT_PARAMS);
    expect(validate(p).some((i) => i.path === 'dividers.height' && i.level === 'error')).toBe(true);
  });

  it('範囲外・重なった位置はエラー', () => {
    const out = withDividers({ x: { enabled: true, mode: 'custom', divisions: 2, positions: [100] } });
    const overlap = withDividers({ x: { enabled: true, mode: 'custom', divisions: 2, positions: [50, 50.5] } });
    expect(hasError(validate(out))).toBe(true);
    expect(hasError(validate(overlap))).toBe(true);
  });

  it('切り欠きが仕切りより深いとエラー', () => {
    const p = withDividers({ x: X2, notchShape: 'v', notchDepth: 40 });
    expect(hasError(validate(p))).toBe(true);
  });

  it('区画数が整数でないとエラー', () => {
    expect(hasError(validate(withDividers({ x: { ...X2, divisions: 2.5 } })))).toBe(true);
  });
});
