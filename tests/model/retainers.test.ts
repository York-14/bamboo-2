import { afterEach, describe, expect, it } from 'vitest';
import type { Manifold } from 'manifold-3d';
import { buildCase, buildCaseManifolds } from '../../src/model/build';
import { Scope } from '../../src/model/geometry/scope';
import { DEFAULT_HOLE, DEFAULT_PARAMS, DEFAULT_RETAINERS, normalizeParams, type CaseParams, type RetainerParams } from '../../src/model/params';
import { hasError, validate } from '../../src/model/validate';
import { isWatertight, loadWasm } from './helpers';

let scope = new Scope();
afterEach(() => {
  scope.dispose();
  scope = new Scope();
});

const NO_LID: CaseParams = { ...DEFAULT_PARAMS, lid: { ...DEFAULT_PARAMS.lid, enabled: false } };
const TB = DEFAULT_PARAMS.body.bottomThickness;

function ret(type: RetainerParams['type'], patch: Partial<RetainerParams> = {}): RetainerParams {
  return { ...DEFAULT_RETAINERS[type], id: patch.id ?? `r-${type}`, ...patch };
}

function withRetainers(retainers: RetainerParams[], base: CaseParams = NO_LID): CaseParams {
  return { ...base, retainers };
}

/** 抜け止めで増えた部分だけの形状 */
async function added(p: CaseParams): Promise<Manifold> {
  const wasm = await loadWasm();
  const plain = buildCaseManifolds(wasm, scope, { ...p, retainers: [] }).body;
  return scope.keep(buildCaseManifolds(wasm, scope, p).body.subtract(plain));
}

/** 下向きの面のうち、45° より寝ている（サポートが必要な）面の面積。床に接する面は除く */
function steepOverhangArea(m: Manifold, floorZ: number): number {
  const mesh = m.getMesh();
  const pos = mesh.vertProperties;
  const np = mesh.numProp;
  const tri = mesh.triVerts;
  let area = 0;
  for (let t = 0; t < tri.length; t += 3) {
    const [a, b, c] = [tri[t], tri[t + 1], tri[t + 2]].map((i) => [pos[i * np], pos[i * np + 1], pos[i * np + 2]]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-12) continue;
    const onFloor = Math.max(a[2], b[2], c[2]) < floorZ + 1e-4;
    if (!onFloor && n[2] / len < -Math.SQRT1_2 - 1e-3) area += len / 2;
  }
  return area;
}

describe('つぶしリブ', () => {
  it('手前の壁の内面から突き出し量だけ出て、指定の位置・高さにある', async () => {
    const r = ret('crushRib', { u: 10, ribCount: 1, z: 0, ribLength: 20, protrusion: 0.4, ribBase: 1.6 });
    const bb = (await added(withRetainers([r]))).boundingBox();
    expect(bb.min[0]).toBeCloseTo(9.2, 3);
    expect(bb.max[0]).toBeCloseTo(10.8, 3);
    expect(bb.min[1]).toBeCloseTo(-30, 3);
    expect(bb.max[1]).toBeCloseTo(-29.6, 3);
    expect(bb.min[2]).toBeCloseTo(TB, 3);
    expect(bb.max[2]).toBeCloseTo(TB + 20, 3);
  });

  it('本数・間隔のとおりに並ぶ', async () => {
    const r = ret('crushRib', { u: 0, ribCount: 3, ribPitch: 5 });
    const bb = (await added(withRetainers([r]))).boundingBox();
    expect(bb.min[0]).toBeCloseTo(-5.8, 3);
    expect(bb.max[0]).toBeCloseTo(5.8, 3);
  });

  it.each([
    ['back', [-1, 0], 1],
    ['left', [0, -1], 0],
    ['right', [0, 1], 0],
  ] as const)('%s の壁にも、外から見た右方向に u で置かれる', async (face, right, normalAxis) => {
    const p = withRetainers([ret('crushRib', { face, u: 10, ribCount: 1 })]);
    const bb = (await added(p)).boundingBox();
    const along = normalAxis === 0 ? 1 : 0;
    expect((bb.min[along] + bb.max[along]) / 2).toBeCloseTo(10 * right[along], 3);
    const half = normalAxis === 0 ? p.body.innerWidth / 2 : p.body.innerDepth / 2;
    const sign = face === 'back' || face === 'right' ? 1 : -1;
    // 内面から 0.4 だけ内側まで
    const inner = sign > 0 ? bb.min[normalAxis] : bb.max[normalAxis];
    expect(Math.abs(inner)).toBeCloseTo(half - 0.4, 3);
  });
});

describe('ストッパー・棚', () => {
  it('ストッパーは先端の高さ z、下は斜面ぶん下がり、上はガイドの斜面ぶん上がる', async () => {
    const r = ret('stopper', { z: 15, protrusion: 1, undersideAngle: 45, topAngle: 30, length: 10 });
    const bb = (await added(withRetainers([r]))).boundingBox();
    expect(bb.max[1]).toBeCloseTo(-29, 3);
    expect(bb.min[2]).toBeCloseTo(TB + 15 - 1, 3);
    expect(bb.max[2]).toBeCloseTo(TB + 15 + 1 / Math.tan(Math.PI / 6), 3);
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(10, 3);
  });

  it('壁の端から端まで（fullLength）は内寸いっぱいで、外にはみ出さない', async () => {
    const p = withRetainers([ret('shelf', { face: 'front', fullLength: true, z: 5, protrusion: 2 })]);
    const bb = (await added(p)).boundingBox();
    expect(bb.min[0]).toBeGreaterThan(-50 - 1e-6);
    expect(bb.max[0]).toBeLessThan(50 + 1e-6);
    expect(bb.max[2]).toBeCloseTo(TB + 5, 3);
  });

  it('全周の棚は内側の輪郭に沿い、中央は空いている', async () => {
    const p = withRetainers([ret('shelf', { face: 'all', z: 5, protrusion: 2 })]);
    const shelf = await added(p);
    const bb = shelf.boundingBox();
    expect(bb.min[0]).toBeCloseTo(-50, 3);
    expect(bb.max[1]).toBeCloseTo(30, 3);
    expect(bb.max[2]).toBeCloseTo(TB + 5, 3);
    const wasm = await loadWasm();
    const probe = (x: number, y: number, z: number) =>
      scope.keep(shelf.intersect(scope.keep(scope.keep(wasm.Manifold.cube([0.2, 0.2, 0.2], true)).translate(x, y, z)))).volume();
    expect(probe(0, 0, TB + 4.5)).toBe(0);
    expect(probe(0, -29, TB + 4.5)).toBeGreaterThan(0);
    expect(probe(-49, 0, TB + 4.5)).toBeGreaterThan(0);
  });

  it.each([
    ['crushRib', ret('crushRib', { z: 5 })],
    ['stopper', ret('stopper')],
    ['shelf（壁）', ret('shelf', { face: 'left', fullLength: true })],
    ['shelf（全周）', ret('shelf')],
  ])('%s：下向きの面はすべて 45° 以内（サポート不要）', async (_, r) => {
    expect(steepOverhangArea(await added(withRetainers([r])), TB)).toBeLessThan(1e-6);
  });

  it('下側を 60° にすると、サポートが必要な面ができる（検出できることの確認）', async () => {
    const r = ret('stopper', { undersideAngle: 60 });
    expect(steepOverhangArea(await added(withRetainers([r])), TB)).toBeGreaterThan(0);
  });

  it('フタ付きでも、抜け止めはフタと重ならず、フタは抜ける', async () => {
    const wasm = await loadWasm();
    const p = withRetainers(
      [ret('crushRib', { z: 0, ribLength: 28 }), ret('stopper', { face: 'left', z: 25 }), ret('shelf', { z: 5 })],
      { ...DEFAULT_PARAMS, lid: { ...DEFAULT_PARAMS.lid, clickEnabled: false } },
    );
    expect(hasError(validate(p))).toBe(false);
    const { body, lid } = buildCaseManifolds(wasm, scope, p);
    for (let d = 0; d <= 110; d += 10) {
      expect(scope.keep(body.intersect(scope.keep(lid!.translate(-d, 0, 0)))).volume(), `d=${d}`).toBeLessThan(1e-6);
    }
  });

  it('いろいろな抜け止めを付けても全部品が水密', async () => {
    const wasm = await loadWasm();
    const p = withRetainers(
      [
        ret('crushRib', { id: 'a', face: 'right', ribCount: 3, ribPitch: 8 }),
        ret('stopper', { id: 'b', face: 'back', z: 20, length: 30 }),
        ret('shelf', { id: 'c', face: 'all', z: 6 }),
      ],
      DEFAULT_PARAMS,
    );
    for (const part of buildCase(wasm, p).parts) expect(isWatertight(part.mesh), part.name).toBe(true);
  });
});

describe('抜け止めの入力検証', () => {
  const issuesOf = (p: CaseParams) => validate(p).filter((i) => i.path.startsWith('retainers.'));

  it('各種類の初期値はエラーも警告もない（フタ付き）', () => {
    for (const type of ['crushRib', 'stopper', 'shelf'] as const) {
      expect(issuesOf(withRetainers([ret(type)], DEFAULT_PARAMS)), type).toEqual([]);
    }
  });

  it('フタに当たる高さはエラー', () => {
    expect(hasError(validate(withRetainers([ret('crushRib', { ribLength: 30 })], DEFAULT_PARAMS)))).toBe(true);
  });

  it('下側の斜面で床より下にはみ出すとエラー', () => {
    expect(hasError(validate(withRetainers([ret('stopper', { z: 0.5, protrusion: 1 })])))).toBe(true);
  });

  it('下側が 45° を超えると警告', () => {
    const issues = issuesOf(withRetainers([ret('stopper', { undersideAngle: 60 })]));
    expect(issues.some((i) => i.level === 'warning' && i.message.includes('サポート'))).toBe(true);
  });

  it('全周はつぶしリブには使えない', () => {
    expect(hasError(validate(withRetainers([ret('crushRib', { face: 'all' })])))).toBe(true);
  });

  it('壁の角にかかると警告、壁からはみ出すとエラー', () => {
    expect(issuesOf(withRetainers([ret('stopper', { u: 44, length: 10 })])).some((i) => i.message.includes('角'))).toBe(true);
    expect(hasError(validate(withRetainers([ret('stopper', { u: 50, length: 10 })])))).toBe(true);
  });

  it('同じ壁の穴と重なると警告', () => {
    const p = { ...withRetainers([ret('stopper', { u: 0, z: 15 })]), holes: [{ ...DEFAULT_HOLE, id: 'h', u: 0, v: 17 }] };
    expect(issuesOf(p).some((i) => i.message.includes('穴'))).toBe(true);
    const other = { ...p, holes: [{ ...DEFAULT_HOLE, id: 'h', face: 'back' as const, u: 0, v: 17 }] };
    expect(issuesOf(other).some((i) => i.message.includes('穴'))).toBe(false);
  });

  it('仕切りと重なると警告', () => {
    const p: CaseParams = {
      ...withRetainers([ret('crushRib', { u: 0, ribCount: 1 })]),
      dividers: { ...NO_LID.dividers, x: { enabled: true, mode: 'equal', divisions: 2, positions: [] } },
    };
    expect(issuesOf(p).some((i) => i.message.includes('仕切り'))).toBe(true);
  });

  it('JSON 読み込み：種類が不正ならつぶしリブ、全周は棚以外では読み込めても検証でエラー', () => {
    const p = normalizeParams({ retainers: [{ type: 'hook', z: 3 }, { type: 'shelf', face: 'all' }] });
    expect(p.retainers.map((r) => r.type)).toEqual(['crushRib', 'shelf']);
    expect(p.retainers[0].z).toBe(3);
    expect(p.retainers[1].face).toBe('all');
  });
});
