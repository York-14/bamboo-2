import { describe, expect, it } from 'vitest';
import { buildCase } from '../../src/model/build';
import { deriveDims } from '../../src/model/derive';
import { DEFAULT_PARAMS, type CaseParams } from '../../src/model/params';
import { bounds, isWatertight, loadWasm, roundedRectArea } from './helpers';

/** フタなしの本体だけを検証する */
const NO_LID: CaseParams = { ...DEFAULT_PARAMS, lid: { ...DEFAULT_PARAMS.lid, enabled: false } };

function withBody(patch: Partial<CaseParams['body']>): CaseParams {
  return { ...NO_LID, body: { ...NO_LID.body, ...patch } };
}

describe('本体の生成（フタなし）', () => {
  it('代表サイズ（内寸 100×60×30）の外寸が 104.8×64.8×32 になる', async () => {
    const wasm = await loadWasm();
    const body = buildCase(wasm, NO_LID).parts[0];
    const { min, size } = bounds(body.mesh);
    expect(size[0]).toBeCloseTo(104.8, 4);
    expect(size[1]).toBeCloseTo(64.8, 4);
    expect(size[2]).toBeCloseTo(32, 4);
    expect(min[2]).toBeCloseTo(0, 6);
  });

  it('メッシュが水密である', async () => {
    const wasm = await loadWasm();
    expect(isWatertight(buildCase(wasm, NO_LID).parts[0].mesh)).toBe(true);
  });

  it('体積が理論値とほぼ一致する', async () => {
    const wasm = await loadWasm();
    const p = NO_LID;
    const d = deriveDims(p);
    const expected =
      roundedRectArea(d.outerWidth, d.outerDepth, p.body.cornerRadius) * d.outerHeight -
      roundedRectArea(p.body.innerWidth, p.body.innerDepth, d.innerCornerRadius) * p.body.innerHeight;
    const volume = buildCase(wasm, p).parts[0].volume;
    expect(Math.abs(volume - expected) / expected).toBeLessThan(0.002);
  });

  it('角の丸み 0 では体積が直方体の差に一致する', async () => {
    const wasm = await loadWasm();
    const p = withBody({ cornerRadius: 0 });
    const d = deriveDims(p);
    const expected =
      d.outerWidth * d.outerDepth * d.outerHeight -
      p.body.innerWidth * p.body.innerDepth * p.body.innerHeight;
    expect(buildCase(wasm, p).parts[0].volume).toBeCloseTo(expected, 3);
  });

  it('角の丸みが短辺の半分ちょうどでも生成できる', async () => {
    const wasm = await loadWasm();
    const p = withBody({ cornerRadius: (60 + 2 * 2.4) / 2 });
    const body = buildCase(wasm, p).parts[0];
    expect(isWatertight(body.mesh)).toBe(true);
    expect(body.volume).toBeGreaterThan(0);
  });

  it('底面の面取りで体積が減り、外寸は変わらない', async () => {
    const wasm = await loadWasm();
    const plain = buildCase(wasm, NO_LID).parts[0];
    const chamfered = buildCase(wasm, withBody({ bottomChamfer: 1 })).parts[0];
    expect(chamfered.volume).toBeLessThan(plain.volume);
    expect(bounds(chamfered.mesh).size[0]).toBeCloseTo(104.8, 4);
    expect(isWatertight(chamfered.mesh)).toBe(true);
  });
});
