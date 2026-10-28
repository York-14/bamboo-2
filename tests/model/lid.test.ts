import { afterEach, describe, expect, it } from 'vitest';
import type { Manifold } from 'manifold-3d';
import { buildCase, buildCaseManifolds } from '../../src/model/build';
import { deriveDims, deriveLidDims } from '../../src/model/derive';
import { DEFAULT_PARAMS, ENTRY_SIDES, type CaseParams } from '../../src/model/params';
import { Scope } from '../../src/model/geometry/scope';
import { bounds, isWatertight, loadWasm } from './helpers';

function withLid(patch: Partial<CaseParams['lid']>, body: Partial<CaseParams['body']> = {}): CaseParams {
  return {
    ...DEFAULT_PARAMS,
    body: { ...DEFAULT_PARAMS.body, ...body },
    lid: { ...DEFAULT_PARAMS.lid, ...patch },
  };
}

let scope = new Scope();
afterEach(() => {
  scope.dispose();
  scope = new Scope();
});

/** 2 つの形状の重なり体積 */
function overlap(a: Manifold, b: Manifold): number {
  return scope.keep(a.intersect(b)).volume();
}

/** フタを開ける方向へ distance だけ動かす */
function slid(lid: Manifold, p: CaseParams, distance: number): Manifold {
  const [dx, dy] = deriveLidDims(p).openDir;
  return scope.keep(lid.translate(dx * distance, dy * distance, 0));
}

describe('スライドフタ', () => {
  it('フタ付きの外寸は 104.8×64.8×34（底厚 + 内寸高さ + フタ厚）', async () => {
    const wasm = await loadWasm();
    const r = buildCase(wasm, DEFAULT_PARAMS);
    const body = r.parts.find((p) => p.name === 'body')!;
    const size = bounds(body.mesh).size;
    expect(size[0]).toBeCloseTo(104.8, 4);
    expect(size[1]).toBeCloseTo(64.8, 4);
    expect(size[2]).toBeCloseTo(34, 4);
  });

  it('本体・フタ・テスト片がすべて水密', async () => {
    const wasm = await loadWasm();
    const r = buildCase(wasm, DEFAULT_PARAMS);
    expect(r.parts.map((p) => p.name)).toEqual(['body', 'lid', 'coupon-body', 'coupon-lid']);
    for (const part of r.parts) expect(isWatertight(part.mesh), part.name).toBe(true);
  });

  it('閉じた状態で本体とフタが重ならない（クリックの凸は凹に収まる）', async () => {
    const wasm = await loadWasm();
    const { body, lid } = buildCaseManifolds(wasm, scope, DEFAULT_PARAMS);
    expect(overlap(body, lid!)).toBeLessThan(1e-6);
  });

  it('フタの上面は本体の上面と揃う', async () => {
    const wasm = await loadWasm();
    const { body, lid } = buildCaseManifolds(wasm, scope, DEFAULT_PARAMS);
    expect(lid!.boundingBox().max[2]).toBeCloseTo(body.boundingBox().max[2], 6);
  });

  it('クリックなしなら、開ける方向にどこまで動かしても本体と重ならない', async () => {
    const wasm = await loadWasm();
    const p = withLid({ clickEnabled: false });
    const { body, lid } = buildCaseManifolds(wasm, scope, p);
    const travel = deriveLidDims(p).length + 10;
    for (let d = 0; d <= travel; d += 7.5) {
      expect(overlap(body, slid(lid!, p, d)), `d=${d}`).toBeLessThan(1e-6);
    }
  });

  it('クリックありなら、開け始めに凸が壁に引っかかる', async () => {
    const wasm = await loadWasm();
    const { body, lid } = buildCaseManifolds(wasm, scope, DEFAULT_PARAMS);
    expect(overlap(body, slid(lid!, DEFAULT_PARAMS, 1.5))).toBeGreaterThan(0);
  });

  it('フタは上に持ち上げられない（アリ溝に掛かっている）', async () => {
    const wasm = await loadWasm();
    const p = withLid({ clickEnabled: false });
    const { body, lid } = buildCaseManifolds(wasm, scope, p);
    // 斜面が 45° なら、横の隙間 0.25 と同じだけ持ち上がったところで斜面に当たる
    expect(overlap(body, scope.keep(lid!.translate(0, 0, 0.2)))).toBeLessThan(1e-6);
    expect(overlap(body, scope.keep(lid!.translate(0, 0, 0.3)))).toBeGreaterThan(0);
  });

  it('奥側に押し込めない（奥の溝の突き当たり）', async () => {
    const wasm = await loadWasm();
    const p = withLid({ clickEnabled: false });
    const { body, lid } = buildCaseManifolds(wasm, scope, p);
    expect(overlap(body, slid(lid!, p, -1))).toBeGreaterThan(0);
  });

  it.each(ENTRY_SIDES)('差し込み方向 %s でも、閉じた状態で重ならず、開ける方向に抜ける', async (side) => {
    const wasm = await loadWasm();
    const p = withLid({ entrySide: side, clickEnabled: false });
    const { body, lid } = buildCaseManifolds(wasm, scope, p);
    const d = deriveDims(p);
    const bb = body.boundingBox();
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(d.outerWidth, 4);
    expect(bb.max[1] - bb.min[1]).toBeCloseTo(d.outerDepth, 4);
    expect(overlap(body, lid!)).toBeLessThan(1e-6);
    expect(overlap(body, slid(lid!, p, 20))).toBeLessThan(1e-6);
    expect(overlap(body, slid(lid!, p, -1))).toBeGreaterThan(0);
  });

  it('reduced モード（フタの角を小さく丸める）でも重ならずに抜ける', async () => {
    const wasm = await loadWasm();
    const p = withLid({ cornerMode: 'reduced', cornerRadius: 1.5, clickEnabled: false }, { cornerRadius: 6, wallThickness: 3 });
    const { body, lid } = buildCaseManifolds(wasm, scope, p);
    expect(overlap(body, lid!)).toBeLessThan(1e-6);
    expect(overlap(body, slid(lid!, p, 30))).toBeLessThan(1e-6);
  });

  it('角の丸み 0（内側も直角）でも生成できる', async () => {
    const wasm = await loadWasm();
    const p = withLid({}, { cornerRadius: 0 });
    const r = buildCase(wasm, p);
    for (const part of r.parts) expect(isWatertight(part.mesh), part.name).toBe(true);
  });

  it('印刷配置のフタは Z=0 に接地し、高さはフタ厚 + 凸の高さ', async () => {
    const wasm = await loadWasm();
    const r = buildCase(wasm, DEFAULT_PARAMS);
    const lid = r.parts.find((p) => p.name === 'lid')!;
    const m = lid.printMatrix;
    let zMin = Infinity;
    let zMax = -Infinity;
    const pos = lid.mesh.positions;
    for (let i = 0; i < pos.length; i += 3) {
      const z = m[2] * pos[i] + m[6] * pos[i + 1] + m[10] * pos[i + 2] + m[14];
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
    }
    expect(zMin).toBeCloseTo(0, 5);
    expect(zMax).toBeCloseTo(2 + deriveLidDims(DEFAULT_PARAMS).clickBumpHeight, 3);
  });

  it('テスト片は小さい（外形 30 mm 角程度）', async () => {
    const wasm = await loadWasm();
    const coupon = buildCase(wasm, DEFAULT_PARAMS).parts.find((p) => p.name === 'coupon-body')!;
    const size = bounds(coupon.mesh).size;
    expect(size[0]).toBeLessThan(30);
    expect(size[1]).toBeLessThan(40);
    expect(size[2]).toBeLessThan(10);
  });
});
