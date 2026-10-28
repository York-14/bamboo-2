import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, normalizeParams, type CaseParams } from '../../src/model/params';
import { hasError, validate } from '../../src/model/validate';

function withBody(patch: Partial<CaseParams['body']>): CaseParams {
  return { ...DEFAULT_PARAMS, body: { ...DEFAULT_PARAMS.body, ...patch } };
}

describe('入力検証', () => {
  it('初期値はエラーも警告もない', () => {
    expect(validate(DEFAULT_PARAMS)).toEqual([]);
  });

  it('内寸 0 はエラー', () => {
    expect(hasError(validate(withBody({ innerWidth: 0 })))).toBe(true);
  });

  it('角の丸みが外寸の短辺の半分を超えるとエラー', () => {
    expect(hasError(validate(withBody({ cornerRadius: 40 })))).toBe(true);
  });

  it('面取りが底厚以上だとエラー', () => {
    expect(hasError(validate(withBody({ bottomChamfer: 2 })))).toBe(true);
  });

  it('壁厚が最小壁厚未満なら警告（エラーではない）', () => {
    const issues = validate({ ...withBody({ wallThickness: 1.0 }), lid: { ...DEFAULT_PARAMS.lid, enabled: false } });
    expect(hasError(issues)).toBe(false);
    expect(issues.some((i) => i.path === 'body.wallThickness' && i.level === 'warning')).toBe(true);
  });
});

describe('フタの入力検証', () => {
  const withLid = (patch: Partial<CaseParams['lid']>): CaseParams => ({
    ...DEFAULT_PARAMS,
    lid: { ...DEFAULT_PARAMS.lid, ...patch },
  });

  it('溝が壁を突き抜けるとエラー', () => {
    expect(hasError(validate(withBody({ wallThickness: 1.0 })))).toBe(true);
  });

  it('フタ厚が溝の深さ以下だとエラー', () => {
    expect(hasError(validate(withLid({ thickness: 1.2 })))).toBe(true);
  });

  it('横方向の隙間が溝の深さ以上だとエラー', () => {
    expect(hasError(validate(withLid({ sideClearance: 1.2 })))).toBe(true);
  });

  it('溝で残る壁が最小壁厚より薄いと警告', () => {
    const issues = validate(withLid({ grooveDepth: 1.6 }));
    expect(hasError(issues)).toBe(false);
    expect(issues.some((i) => i.path === 'lid.grooveDepth')).toBe(true);
  });

  it('reduced モードで角の丸みが小さいと、角で壁が薄くなり警告', () => {
    const issues = validate(withLid({ cornerMode: 'reduced', cornerRadius: 0 }));
    expect(issues.some((i) => i.path === 'lid.grooveDepth' && i.level === 'warning')).toBe(true);
  });
});

describe('パラメータの正規化', () => {
  it('欠けた項目や不正な値は既定値で埋める', () => {
    const p = normalizeParams({ body: { innerWidth: 120, innerDepth: 'x' } });
    expect(p.body.innerWidth).toBe(120);
    expect(p.body.innerDepth).toBe(DEFAULT_PARAMS.body.innerDepth);
    expect(p.print).toEqual(DEFAULT_PARAMS.print);
  });

  it('候補にない文字列や型違いの値は既定値になる', () => {
    const p = normalizeParams({ lid: { entrySide: 'z', enabled: 'yes', cornerMode: 'reduced' } });
    expect(p.lid.entrySide).toBe(DEFAULT_PARAMS.lid.entrySide);
    expect(p.lid.enabled).toBe(true);
    expect(p.lid.cornerMode).toBe('reduced');
  });

  it('ステップ 1 の保存データ（lid なし）も読み込める', () => {
    const p = normalizeParams({ version: 1, body: { innerWidth: 80 } });
    expect(p.body.innerWidth).toBe(80);
    expect(p.lid).toEqual(DEFAULT_PARAMS.lid);
  });

  it('オブジェクト以外は既定値になる', () => {
    expect(normalizeParams(null)).toEqual(DEFAULT_PARAMS);
  });
});
