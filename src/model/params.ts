// ケースのパラメータ定義。単位はすべて mm。
// このオブジェクトが唯一の情報源で、形状は毎回ここから作り直す。

export const PARAMS_VERSION = 3;

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

export type DividerMode = 'equal' | 'custom';
export const DIVIDER_MODES: DividerMode[] = ['equal', 'custom'];

/** 一方向に並べる仕切りの組 */
export interface DividerSet {
  enabled: boolean;
  /** equal: 区画数で等分 / custom: 位置を個別に指定 */
  mode: DividerMode;
  /** equal のときの区画数（2 なら仕切り 1 枚） */
  divisions: number;
  /** custom のときの仕切り板の中心位置。内側の空間のマイナス側の壁からの距離 */
  positions: number[];
}

export type DividerHeightMode = 'full' | 'custom';
export const DIVIDER_HEIGHT_MODES: DividerHeightMode[] = ['full', 'custom'];

export type NotchShape = 'none' | 'u' | 'v';
export const NOTCH_SHAPES: NotchShape[] = ['none', 'u', 'v'];

/** 本体と一体で印刷する固定仕切り。x と y を両方有効にすると格子になる */
export interface DividerParams {
  /** X 方向に並べる仕切り（横幅を分割する。板は Y 方向に延びる） */
  x: DividerSet;
  /** Y 方向に並べる仕切り（奥行きを分割する。板は X 方向に延びる） */
  y: DividerSet;
  thickness: number;
  /** full: フタ（または上面）まで / custom: 高さを指定（底面の上側から） */
  heightMode: DividerHeightMode;
  height: number;
  /** full のとき、フタの下面との隙間 */
  topClearance: number;
  /** 指を入れる切り欠き。仕切りで区切られた区画ごとに 1 つ、上端の中央に付ける */
  notchShape: NotchShape;
  notchWidth: number;
  notchDepth: number;
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
  dividers: DividerParams;
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
  dividers: {
    x: { enabled: false, mode: 'equal', divisions: 2, positions: [50] },
    y: { enabled: false, mode: 'equal', divisions: 2, positions: [30] },
    thickness: 1.2,
    heightMode: 'full',
    height: 20,
    topClearance: 1.0,
    notchShape: 'u',
    notchWidth: 20,
    notchDepth: 12,
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

function normalizeDividerSet(defaults: DividerSet, input: unknown): DividerSet {
  const out = mergeFields(defaults, input, { mode: DIVIDER_MODES });
  const positions = (input as { positions?: unknown } | null)?.positions;
  out.positions = Array.isArray(positions)
    ? positions.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    : [...defaults.positions];
  return out;
}

function normalizeDividers(input: unknown): DividerParams {
  const d = DEFAULT_PARAMS.dividers;
  const obj = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  return {
    ...mergeFields(d, input, { heightMode: DIVIDER_HEIGHT_MODES, notchShape: NOTCH_SHAPES }),
    x: normalizeDividerSet(d.x, obj.x),
    y: normalizeDividerSet(d.y, obj.y),
  };
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
    dividers: normalizeDividers(obj.dividers),
    print: mergeFields(DEFAULT_PARAMS.print, obj.print),
  };
}
