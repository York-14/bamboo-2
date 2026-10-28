import { afterEach, describe, expect, it } from 'vitest';
import type { Manifold } from 'manifold-3d';
import { buildCase, buildCaseManifolds } from '../../src/model/build';
import { deriveDividerLayout, deriveLayerDims } from '../../src/model/derive';
import { Scope } from '../../src/model/geometry/scope';
import { DEFAULT_HOLE, DEFAULT_PARAMS, DEFAULT_RETAINERS, normalizeParams, type CaseParams, type LayerParams } from '../../src/model/params';
import { hasError, validate } from '../../src/model/validate';
import { bounds, isWatertight, loadWasm } from './helpers';

let scope = new Scope();
afterEach(() => {
  scope.dispose();
  scope = new Scope();
});

const TB = DEFAULT_PARAMS.body.bottomThickness;

function withLayer(patch: Partial<LayerParams> = {}, base: CaseParams = DEFAULT_PARAMS): CaseParams {
  return { ...base, layer: { ...base.layer, enabled: true, fingerHole: 'none', ...patch } };
}

const overlap = (a: Manifold, b: Manifold) => scope.keep(a.intersect(b)).volume();

describe('中板', () => {
  it('中板は内寸から隙間を引いた大きさで、段の上（床面から height）に載る', async () => {
    const wasm = await loadWasm();
    const { plate } = buildCaseManifolds(wasm, scope, withLayer({ height: 15, plateThickness: 2, sideClearance: 0.3 }));
    const bb = plate!.boundingBox();
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(100 - 0.6, 4);
    expect(bb.max[1] - bb.min[1]).toBeCloseTo(60 - 0.6, 4);
    expect(bb.min[2]).toBeCloseTo(TB + 15, 6);
    expect(bb.max[2]).toBeCloseTo(TB + 17, 6);
  });

  it('中板は本体と重ならず、少しでも下げると段に当たる（段に載っている）', async () => {
    const wasm = await loadWasm();
    const { body, plate } = buildCaseManifolds(wasm, scope, withLayer());
    expect(overlap(body, plate!)).toBeLessThan(1e-6);
    expect(overlap(body, scope.keep(plate!.translate(0, 0, -0.1)))).toBeGreaterThan(0);
  });

  it('中板はそのまま真上に取り出せる（フタを外した状態）', async () => {
    const wasm = await loadWasm();
    const p = withLayer();
    const { body, plate } = buildCaseManifolds(wasm, scope, p);
    for (let dz = 0; dz <= 20; dz += 2) {
      expect(overlap(body, scope.keep(plate!.translate(0, 0, dz))), `dz=${dz}`).toBeLessThan(1e-6);
    }
  });

  it('フタは中板があっても閉まり、最後まで抜ける', async () => {
    const wasm = await loadWasm();
    const p = withLayer({ height: 25 }, { ...DEFAULT_PARAMS, lid: { ...DEFAULT_PARAMS.lid, clickEnabled: false } });
    expect(hasError(validate(p))).toBe(false);
    const { lid, plate } = buildCaseManifolds(wasm, scope, p);
    for (let d = 0; d <= 110; d += 10) {
      expect(overlap(plate!, scope.keep(lid!.translate(-d, 0, 0))), `d=${d}`).toBeLessThan(1e-6);
    }
  });

  it('縦の仕切りは中板の下だけに作られ、中板と重ならない', async () => {
    const wasm = await loadWasm();
    const p: CaseParams = {
      ...withLayer({ height: 15 }),
      dividers: { ...DEFAULT_PARAMS.dividers, x: { enabled: true, mode: 'equal', divisions: 3, positions: [] }, notchShape: 'none' },
    };
    const layout = deriveDividerLayout(p);
    expect(layout.height).toBeCloseTo(15 - DEFAULT_PARAMS.dividers.topClearance, 9);
    const { body, plate } = buildCaseManifolds(wasm, scope, p);
    expect(overlap(body, plate!)).toBeLessThan(1e-6);
  });

  it('指穴（長穴）の面積だけ中板が軽くなる', async () => {
    const wasm = await loadWasm();
    const solid = buildCaseManifolds(wasm, scope, withLayer()).plate!.volume();
    const holed = buildCaseManifolds(wasm, scope, withLayer({ fingerHole: 'slot', fingerHoleSize: 24, fingerHoleWidth: 12 })).plate!.volume();
    const area = (24 - 12) * 12 + Math.PI * 6 * 6;
    expect(Math.abs((solid - holed) - area * 2) / (area * 2)).toBeLessThan(0.005);
  });

  it('中板は「本番の部品」として出力され、印刷配置では Z=0 に平置き', async () => {
    const wasm = await loadWasm();
    const r = buildCase(wasm, withLayer({ fingerHole: 'circle', fingerHoleSize: 20 }));
    expect(r.parts.map((x) => x.name)).toEqual(['body', 'lid', 'plate', 'coupon-body', 'coupon-lid']);
    const plate = r.parts.find((x) => x.name === 'plate')!;
    const m = plate.printMatrix;
    const pos = plate.mesh.positions;
    let zMin = Infinity, zMax = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      const z = m[2] * pos[i] + m[6] * pos[i + 1] + m[10] * pos[i + 2] + m[14];
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
    }
    expect(zMin).toBeCloseTo(0, 5);
    expect(zMax).toBeCloseTo(2, 5);
    for (const part of r.parts) expect(isWatertight(part.mesh), part.name).toBe(true);
  });

  it('受けの段は本体の外にはみ出さない（外寸は変わらない）', async () => {
    const wasm = await loadWasm();
    const body = buildCase(wasm, withLayer()).parts[0];
    const size = bounds(body.mesh).size;
    expect(size[0]).toBeCloseTo(104.8, 4);
    expect(size[1]).toBeCloseTo(64.8, 4);
  });
});

describe('中板の入力検証', () => {
  const issuesOf = (p: CaseParams) => validate(p).filter((i) => i.path.startsWith('layer.'));

  it('初期値（有効化）ではエラーも警告もない', () => {
    expect(validate({ ...DEFAULT_PARAMS, layer: { ...DEFAULT_PARAMS.layer, enabled: true } })).toEqual([]);
  });

  it('段の奥行きが隙間以下だと中板が載らずエラー', () => {
    expect(hasError(validate(withLayer({ ledgeDepth: 0.3, sideClearance: 0.3 })))).toBe(true);
  });

  it('段の斜面が床より下にはみ出すとエラー', () => {
    expect(hasError(validate(withLayer({ height: 2 })))).toBe(true);
    expect(deriveLayerDims(withLayer({ height: 2 })).ledgeLowest).toBeLessThan(0);
  });

  it('フタに当たる高さはエラー', () => {
    expect(issuesOf(withLayer({ height: 28 })).some((i) => i.level === 'error' && i.message.includes('フタ'))).toBe(true);
  });

  it('仕切りの高さ指定が中板を超えるとエラー', () => {
    const p: CaseParams = {
      ...withLayer({ height: 15 }),
      dividers: { ...DEFAULT_PARAMS.dividers, x: { enabled: true, mode: 'equal', divisions: 2, positions: [] }, heightMode: 'custom', height: 20 },
    };
    expect(validate(p).some((i) => i.path === 'dividers.height' && i.message.includes('中板'))).toBe(true);
  });

  it('中板の高さにかかる抜け止め・壁の穴は警告', () => {
    const p: CaseParams = {
      ...withLayer({ height: 15 }),
      retainers: [{ ...DEFAULT_RETAINERS.stopper, id: 's', z: 15 }],
      holes: [{ ...DEFAULT_HOLE, id: 'h', v: TB + 15, width: 6 }],
    };
    const issues = validate(p);
    expect(issues.some((i) => i.path === 'retainers.s' && i.message.includes('中板'))).toBe(true);
    expect(issues.some((i) => i.path === 'holes.h' && i.message.includes('中板'))).toBe(true);
  });

  it('指穴が大きすぎるとエラー', () => {
    expect(hasError(validate(withLayer({ fingerHole: 'circle', fingerHoleSize: 55 })))).toBe(true);
  });

  it('以前の保存データ（layer なし）は中板なしで読み込む', () => {
    expect(normalizeParams({ version: 5 }).layer.enabled).toBe(false);
  });
});
