// ケースのパラメータ定義。単位はすべて mm。
// このオブジェクトが唯一の情報源で、形状は毎回ここから作り直す。

export const PARAMS_VERSION = 1;

export interface BodyParams {
  /** 内寸 横（X） */
  innerWidth: number;
  /** 内寸 縦（Y） */
  innerDepth: number;
  /** 内寸 高さ（底面の上側からフタの下面まで） */
  innerHeight: number;
  /** 側面の壁厚 */
  wallThickness: number;
  /** 底面の厚み */
  bottomThickness: number;
  /** 平面で見た外側の角の丸み */
  cornerRadius: number;
  /** 底面エッジの面取り（0 で無効） */
  bottomChamfer: number;
}

export interface PrintParams {
  /** ノズル径 */
  nozzleDiameter: number;
  /** これより薄い壁・底は警告する */
  minWall: number;
  /** 円弧の分割数（360° あたり） */
  circularSegments: number;
}

export interface CaseParams {
  version: number;
  body: BodyParams;
  print: PrintParams;
}

export const DEFAULT_PARAMS: CaseParams = {
  version: PARAMS_VERSION,
  body: {
    innerWidth: 100,
    innerDepth: 60,
    innerHeight: 30,
    wallThickness: 2.4,
    bottomThickness: 2.0,
    cornerRadius: 4.0,
    bottomChamfer: 0,
  },
  print: {
    nozzleDiameter: 0.4,
    minWall: 1.2,
    circularSegments: 64,
  },
};

/** 既定値の構造に沿って、数値として有効な値だけを取り込む */
function mergeNumbers<T extends object>(defaults: T, input: unknown): T {
  const out = { ...defaults };
  if (typeof input !== 'object' || input === null) return out;
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const v = (input as Record<string, unknown>)[key as string];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = v as T[keyof T];
    }
  }
  return out;
}

/** JSON 読み込み・localStorage 復元時の正規化。欠けた項目や不正な値は既定値で埋める */
export function normalizeParams(input: unknown): CaseParams {
  const obj = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  return {
    version: PARAMS_VERSION,
    body: mergeNumbers(DEFAULT_PARAMS.body, obj.body),
    print: mergeNumbers(DEFAULT_PARAMS.print, obj.print),
  };
}
