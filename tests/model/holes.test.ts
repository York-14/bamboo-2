import { afterEach, describe, expect, it } from 'vitest';
import type { Manifold } from 'manifold-3d';
import { buildCase, buildCaseManifolds } from '../../src/model/build';
import { deriveDims, deriveLidDims } from '../../src/model/derive';
import { holeProfile } from '../../src/model/geometry/holes';
import { Scope } from '../../src/model/geometry/scope';
import { DEFAULT_HOLE, DEFAULT_PARAMS, normalizeParams, type CaseParams, type HoleParams } from '../../src/model/params';
import { hasError, validate } from '../../src/model/validate';
import { isWatertight, loadWasm } from './helpers';

let scope = new Scope();
afterEach(() => {
  scope.dispose();
  scope = new Scope();
});

const NO_LID: CaseParams = { ...DEFAULT_PARAMS, lid: { ...DEFAULT_PARAMS.lid, enabled: false } };
const NO_COMP = (p: CaseParams): CaseParams => ({ ...p, print: { ...p.print, holeCompensation: 0 } });

function hole(patch: Partial<HoleParams>): HoleParams {
  return { ...DEFAULT_HOLE, id: patch.id ?? 'h1', ...patch, pattern: { ...DEFAULT_HOLE.pattern, ...patch.pattern } };
}

function withHoles(holes: HoleParams[], base: CaseParams = NO_LID): CaseParams {
  return { ...base, holes };
}

/** 点 (x, y, z) の周り 0.4 mm 角に材料がどれだけあるか */
async function solidAt(m: Manifold, x: number, y: number, z: number): Promise<number> {
  const wasm = await loadWasm();
  const cube = scope.keep(scope.keep(wasm.Manifold.cube([0.4, 0.4, 0.4], true)).translate(x, y, z));
  return scope.keep(m.intersect(cube)).volume();
}

describe('穴の位置（面ごとの座標の向き）', () => {
  const p0 = NO_LID;
  const d = deriveDims(p0);
  const t = p0.body.wallThickness;
  const full = 0.4 ** 3;
  // 外から見て右へ 10 mm、高さ 15 mm。期待するワールド座標と、左右反対側の座標
  const cases = [
    { face: 'front', at: [10, -d.outerDepth / 2 + t / 2], mirror: [-10, -d.outerDepth / 2 + t / 2] },
    { face: 'back', at: [-10, d.outerDepth / 2 - t / 2], mirror: [10, d.outerDepth / 2 - t / 2] },
    { face: 'left', at: [-d.outerWidth / 2 + t / 2, -10], mirror: [-d.outerWidth / 2 + t / 2, 10] },
    { face: 'right', at: [d.outerWidth / 2 - t / 2, 10], mirror: [d.outerWidth / 2 - t / 2, -10] },
  ] as const;

  it.each(cases)('$face：外から見た右方向に u、高さ v の位置に開く', async ({ face, at, mirror }) => {
    const wasm = await loadWasm();
    const { body } = buildCaseManifolds(wasm, scope, withHoles([hole({ face, u: 10, v: 15, width: 6 })]));
    expect(await solidAt(body, at[0], at[1], 15)).toBeLessThan(1e-9);
    expect(await solidAt(body, mirror[0], mirror[1], 15)).toBeCloseTo(full, 9);
  });

  it('bottom：上から見て u = X、v = Y', async () => {
    const wasm = await loadWasm();
    const { body } = buildCaseManifolds(wasm, scope, withHoles([hole({ face: 'bottom', u: 20, v: -10, width: 6 })]));
    expect(await solidAt(body, 20, -10, 1)).toBeLessThan(1e-9);
    expect(await solidAt(body, 20, 10, 1)).toBeCloseTo(full, 9);
  });

  it('lid：フタに開き、本体には開かない', async () => {
    const wasm = await loadWasm();
    const p = withHoles([hole({ face: 'lid', u: 20, v: 10, width: 6 })], DEFAULT_PARAMS);
    const { body, lid } = buildCaseManifolds(wasm, scope, p);
    const z = deriveLidDims(p).zLid + 1;
    expect(await solidAt(lid!, 20, 10, z)).toBeLessThan(1e-9);
    expect(await solidAt(lid!, -20, 10, z)).toBeCloseTo(full, 9);
    const plain = buildCaseManifolds(wasm, scope, DEFAULT_PARAMS);
    expect(body.volume()).toBeCloseTo(plain.body.volume(), 6);
  });

  it('フタの差し込み方向を変えても、壁の穴の位置は変わらない', async () => {
    const wasm = await loadWasm();
    const p = withHoles([hole({ face: 'right', u: 10, v: 15, width: 6 })], {
      ...DEFAULT_PARAMS,
      lid: { ...DEFAULT_PARAMS.lid, entrySide: '+y' },
    });
    const { body } = buildCaseManifolds(wasm, scope, p);
    expect(await solidAt(body, d.outerWidth / 2 - t / 2, 10, 15)).toBeLessThan(1e-9);
  });
});

describe('穴の形状と大きさ', () => {
  async function removed(h: HoleParams, base: CaseParams = NO_COMP(NO_LID)): Promise<number> {
    const wasm = await loadWasm();
    const plain = buildCaseManifolds(wasm, scope, base).body.volume();
    return plain - buildCaseManifolds(wasm, scope, withHoles([h], base)).body.volume();
  }

  it('長方形は 幅 × 高さ × 壁厚 だけ削る', async () => {
    expect(await removed(hole({ shape: 'rect', width: 20, height: 6 }))).toBeCloseTo(20 * 6 * 2.4, 3);
  });

  it('寸法補正は幅・高さに足される', async () => {
    const base = { ...NO_LID, print: { ...NO_LID.print, holeCompensation: 0.2 } };
    expect(await removed(hole({ shape: 'rect', width: 20, height: 6 }), base)).toBeCloseTo(20.2 * 6.2 * 2.4, 3);
  });

  it('配列 3×2 は 6 個分削る', async () => {
    const one = await removed(hole({ shape: 'rect', width: 5, height: 3 }));
    const grid = await removed(hole({ shape: 'rect', width: 5, height: 3, pattern: { cols: 3, rows: 2, pitchU: 8, pitchV: 6 } }));
    expect(grid).toBeCloseTo(6 * one, 3);
  });

  it('円は多角形近似の面積どおりに削る', async () => {
    const n = 64;
    const r = 5;
    const area = (n / 2) * r * r * Math.sin((2 * Math.PI) / n);
    expect(await removed(hole({ shape: 'circle', width: 10 }))).toBeCloseTo(area * 2.4, 2);
  });

  it('2D 形状の大きさ：ティアドロップは上に r√2、六角形は上下が対辺、回転は反映される', async () => {
    const wasm = await loadWasm();
    const p = NO_COMP(NO_LID);
    const b = (h: HoleParams) => holeProfile(wasm, scope, p, h).bounds();

    const tear = b(hole({ shape: 'teardrop', width: 10 }));
    expect(tear.max[1]).toBeCloseTo(5 * Math.SQRT2, 6);
    expect(tear.min[1]).toBeCloseTo(-5, 2);

    const hex = b(hole({ shape: 'hexagon', width: 10 }));
    expect(hex.max[1] - hex.min[1]).toBeCloseTo(10, 6);
    expect(hex.max[0] - hex.min[0]).toBeCloseTo(20 / Math.sqrt(3), 6);

    const rot = b(hole({ shape: 'rect', width: 20, height: 6, rotation: 90 }));
    expect(rot.max[0] - rot.min[0]).toBeCloseTo(6, 6);
    expect(rot.max[1] - rot.min[1]).toBeCloseTo(20, 6);

    const slot = b(hole({ shape: 'slot', width: 20, height: 6 }));
    expect(slot.max[0] - slot.min[0]).toBeCloseTo(20, 6);
  });

  it('壁の穴は仕切りを削りすぎない（仕切りの端は残る）', async () => {
    const wasm = await loadWasm();
    const p: CaseParams = {
      ...withHoles([hole({ face: 'front', u: 0, v: 15, width: 8 })]),
      dividers: { ...NO_LID.dividers, x: { enabled: true, mode: 'equal', divisions: 2, positions: [] }, notchShape: 'none' },
    };
    const { body } = buildCaseManifolds(wasm, scope, p);
    // 仕切り（x = 0）の、壁の内面から 0.5 mm 内側には材料がある
    expect(await solidAt(body, 0, -30 + 0.5, 15)).toBeGreaterThan(0);
  });

  it('いろいろな穴を開けても全部品が水密', async () => {
    const wasm = await loadWasm();
    const p = withHoles(
      [
        hole({ id: 'a', face: 'front', shape: 'teardrop', width: 8, u: -20 }),
        hole({ id: 'b', face: 'right', shape: 'hexagon', width: 6, v: 10, pattern: { cols: 3, rows: 1, pitchU: 9, pitchV: 0 } }),
        hole({ id: 'c', face: 'bottom', shape: 'slot', width: 20, height: 4, rotation: 30, v: 0 }),
        hole({ id: 'd', face: 'lid', shape: 'roundRect', width: 20, height: 10, cornerRadius: 2 }),
      ],
      DEFAULT_PARAMS,
    );
    for (const part of buildCase(wasm, p).parts) expect(isWatertight(part.mesh), part.name).toBe(true);
  });
});

describe('穴の入力検証', () => {
  const issuesOf = (p: CaseParams) => validate(p).filter((i) => i.path.startsWith('holes.'));

  it('既定の穴（手前の壁の中央）はエラーも警告もない', () => {
    expect(issuesOf(withHoles([hole({})], DEFAULT_PARAMS))).toEqual([]);
  });

  it('面からはみ出すとエラー', () => {
    expect(hasError(validate(withHoles([hole({ u: 70 })])))).toBe(true);
    expect(hasError(validate(withHoles([hole({ v: 31 })])))).toBe(true);
  });

  it('角の丸みにかかると警告', () => {
    const issues = issuesOf(withHoles([hole({ u: 47, width: 4 })]));
    expect(issues.some((i) => i.level === 'warning' && i.message.includes('角'))).toBe(true);
  });

  it('フタの溝の高さにかかると警告', () => {
    const issues = issuesOf(withHoles([hole({ v: 29, width: 6 })], DEFAULT_PARAMS));
    expect(issues.some((i) => i.message.includes('溝'))).toBe(true);
  });

  it('フタがないのにフタの穴はエラー', () => {
    expect(hasError(validate(withHoles([hole({ face: 'lid' })])))).toBe(true);
  });

  it('仕切りと重なると警告。配列の隙間に仕切りがあれば警告しない', () => {
    const div: CaseParams['dividers'] = {
      ...NO_LID.dividers,
      x: { enabled: true, mode: 'equal', divisions: 2, positions: [] },
    };
    const on = { ...withHoles([hole({ u: 0, width: 6 })]), dividers: div };
    const between = {
      ...withHoles([hole({ u: 0, width: 4, pattern: { cols: 2, rows: 1, pitchU: 10, pitchV: 0 } })]),
      dividers: div,
    };
    expect(issuesOf(on).some((i) => i.message.includes('仕切り'))).toBe(true);
    expect(issuesOf(between).some((i) => i.message.includes('仕切り'))).toBe(false);
  });

  it('配列の間隔が穴より狭いと警告', () => {
    const issues = issuesOf(withHoles([hole({ width: 10, pattern: { cols: 2, rows: 1, pitchU: 8, pitchV: 0 } })]));
    expect(issues.some((i) => i.message.includes('つながります'))).toBe(true);
  });

  it('JSON 読み込み：不正な項目は既定値、id の重複は付け直す', () => {
    const p = normalizeParams({
      holes: [{ id: 'x', face: 'top', width: 5 }, { id: 'x', shape: 'slot' }, 'junk'],
    });
    expect(p.holes).toHaveLength(2);
    expect(p.holes[0].face).toBe('front');
    expect(p.holes[0].width).toBe(5);
    expect(p.holes[1].shape).toBe('slot');
    expect(new Set(p.holes.map((h) => h.id)).size).toBe(2);
  });
});
