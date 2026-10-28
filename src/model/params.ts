// ケースのパラメータ定義。単位はすべて mm。
// このオブジェクトが唯一の情報源で、形状は毎回ここから作り直す。

export const PARAMS_VERSION = 2;

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

/** フタを差し込む側。-x は「X のマイナス側の壁を切り落とし、そこから +X 方向へ差し込む」 */
export type EntrySide = '-x' | '+x' | '-y' | '+y';
export const ENTRY_SIDES: EntrySide[] = ['-x', '+x', '-y', '+y'];

/** match: フタの奥側の角を本体の内側の角に合わせて丸める / reduced: フタの角の丸みを個別に指定 */
export type LidCornerMode = 'match' | 'reduced';
export const LID_CORNER_MODES: LidCornerMode[] = ['match', 'reduced'];

export interface LidParams {
  enabled: boolean;
  /** フタ厚。フタの上面は本体の上面と揃う */
  thickness: number;
  /** 溝の深さ（壁の内面から外側へ掘る量） */
  grooveDepth: number;
  /** 横方向の隙間（片側） */
  sideClearance: number;
  /** 厚み方向の隙間（溝の下側） */
  verticalClearance: number;
  entrySide: EntrySide;
  cornerMode: LidCornerMode;
  /** cornerMode = reduced のときの溝（＝フタ最大幅部）の角の丸み */
  cornerRadius: number;
  /** フタのクリック（抜け止めの凸と凹） */
  clickEnabled: boolean;
  /** クリックの引っかかり量（凸の高さ − 厚み方向の隙間） */
  clickInterference: number;
  /** クリック凸の球の直径 */
  clickDiameter: number;
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
  lid: LidParams;
  print: PrintParams;
}

export const DEFAULT_PARAMS: CaseParams = {
  version: PARAMS_VERSION,
  body: {
    innerWidth: 100,
    innerDepth: 60,
    innerHeight: 30,
    // 溝 1.2 を掘っても最小壁厚 1.2 が残る厚み
    wallThickness: 2.4,
    bottomThickness: 2.0,
    cornerRadius: 4.0,
    bottomChamfer: 0,
  },
  lid: {
    enabled: true,
    thickness: 2.0,
    grooveDepth: 1.2,
    sideClearance: 0.25,
    verticalClearance: 0.2,
    entrySide: '-x',
    cornerMode: 'match',
    cornerRadius: 2.0,
    clickEnabled: true,
    clickInterference: 0.4,
    clickDiameter: 2.0,
  },
  print: {
    nozzleDiameter: 0.4,
    minWall: 1.2,
    circularSegments: 64,
  },
};

/** 既定値の構造に沿って、型が一致する値だけを取り込む（文字列は候補に含まれるものだけ） */
function mergeFields<T extends object>(
  defaults: T,
  input: unknown,
  choices: Partial<Record<keyof T, readonly string[]>> = {},
): T {
  const out = { ...defaults };
  if (typeof input !== 'object' || input === null) return out;
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const v = (input as Record<string, unknown>)[key as string];
    const d = defaults[key];
    if (typeof d === 'number' && typeof v === 'number' && Number.isFinite(v)) {
      out[key] = v as T[keyof T];
    } else if (typeof d === 'boolean' && typeof v === 'boolean') {
      out[key] = v as T[keyof T];
    } else if (typeof d === 'string' && typeof v === 'string' && choices[key]?.includes(v)) {
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
    body: mergeFields(DEFAULT_PARAMS.body, obj.body),
    lid: mergeFields(DEFAULT_PARAMS.lid, obj.lid, {
      entrySide: ENTRY_SIDES,
      cornerMode: LID_CORNER_MODES,
    }),
    print: mergeFields(DEFAULT_PARAMS.print, obj.print),
  };
}
