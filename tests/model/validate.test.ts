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
    const issues = validate(withBody({ wallThickness: 1.0 }));
    expect(hasError(issues)).toBe(false);
    expect(issues.some((i) => i.path === 'body.wallThickness' && i.level === 'warning')).toBe(true);
  });
});

describe('パラメータの正規化', () => {
  it('欠けた項目や不正な値は既定値で埋める', () => {
    const p = normalizeParams({ body: { innerWidth: 120, innerDepth: 'x' } });
    expect(p.body.innerWidth).toBe(120);
    expect(p.body.innerDepth).toBe(DEFAULT_PARAMS.body.innerDepth);
    expect(p.print).toEqual(DEFAULT_PARAMS.print);
  });

  it('オブジェクト以外は既定値になる', () => {
    expect(normalizeParams(null)).toEqual(DEFAULT_PARAMS);
  });
});
