import type { CaseParams, EntrySide } from './params';

export interface DerivedDims {
  outerWidth: number;
  outerDepth: number;
  outerHeight: number;
  /** 内側の空間の角の丸み */
  innerCornerRadius: number;
}

export function deriveDims(p: CaseParams): DerivedDims {
  const b = p.body;
  return {
    outerWidth: b.innerWidth + 2 * b.wallThickness,
    outerDepth: b.innerDepth + 2 * b.wallThickness,
    outerHeight: b.bottomThickness + b.innerHeight + (p.lid.enabled ? p.lid.thickness : 0),
    innerCornerRadius: Math.max(b.cornerRadius - b.wallThickness, 0),
  };
}

const ENTRY: Record<EntrySide, { rotationDeg: number; dir: [number, number] }> = {
  '-x': { rotationDeg: 0, dir: [-1, 0] },
  '+x': { rotationDeg: 180, dir: [1, 0] },
  '-y': { rotationDeg: 90, dir: [0, -1] },
  '+y': { rotationDeg: -90, dir: [0, 1] },
};

/**
 * フタ関連の寸法。
 * フタまわりの形状は「差し込み側が -X」のローカル座標（フレーム）で作り、最後に Z 軸回りに回転する。
 * フレームでは X がスライド方向で内寸 length、Y が直交方向で内寸 span。
 */
export interface LidDims {
  length: number;
  span: number;
  /** フレームからワールドへの Z 軸回りの回転角 */
  rotationDeg: number;
  /** ワールド座標で、フタを開ける（抜く）方向の単位ベクトル */
  openDir: [number, number];
  /** フタの下面の高さ */
  zLid: number;
  /** フタの上面＝本体の上面の高さ */
  zTop: number;
  /** 差し込み側の壁を切り落とす高さ（＝溝の下面） */
  zCut: number;
  /** フタの縁のうち垂直な部分の高さ（その上が 45° の面取り） */
  straightHeight: number;
  /** 溝の最も深い位置での平面形状の角の丸み */
  grooveCornerRadius: number;
  /** 溝を掘った後に残る壁の最小厚み（角の部分を含む） */
  grooveWallMin: number;
  /** クリック凸がフタ下面から飛び出す高さ */
  clickBumpHeight: number;
  /** クリック凹（壁上面のくぼみ）の、壁上面での半径 */
  clickDimpleRadius: number;
  /** クリックの X 位置（フレーム座標）と Y 位置の一覧 */
  clickX: number;
  clickYs: number[];
}

/** クリック凹は凸より一回り大きい球で掘る */
export const CLICK_DIMPLE_MARGIN = 0.1;

/** 角丸長方形の符号付き距離（内側が負）。half は半幅・半奥行き */
function sdRoundRect(x: number, y: number, halfX: number, halfY: number, r: number): number {
  const qx = Math.abs(x) - (halfX - r);
  const qy = Math.abs(y) - (halfY - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

export function deriveLidDims(p: CaseParams): LidDims {
  const b = p.body;
  const l = p.lid;
  const entry = ENTRY[l.entrySide];
  const alongX = l.entrySide === '-x' || l.entrySide === '+x';
  const length = alongX ? b.innerWidth : b.innerDepth;
  const span = alongX ? b.innerDepth : b.innerWidth;
  const innerR = Math.max(b.cornerRadius - b.wallThickness, 0);

  const zLid = b.bottomThickness + b.innerHeight;
  const zTop = zLid + l.thickness;
  const g = l.grooveDepth;
  const grooveCornerRadius =
    l.cornerMode === 'match'
      ? innerR + g
      : Math.min(Math.max(l.cornerRadius, 0), length / 2 + g, span / 2 + g);

  // 溝の輪郭（奥側の角）を外形と比べて、残る壁の最小厚みを求める
  const gx = length / 2 + g;
  const gy = span / 2 + g;
  const ox = length / 2 + b.wallThickness;
  const oy = span / 2 + b.wallThickness;
  const rg = Math.min(grooveCornerRadius, gx, gy);
  let grooveWallMin = Infinity;
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * (Math.PI / 2);
    const x = gx - rg + rg * Math.cos(a);
    const y = gy - rg + rg * Math.sin(a);
    grooveWallMin = Math.min(grooveWallMin, -sdRoundRect(x, y, ox, oy, b.cornerRadius));
  }

  const bumpH = l.clickInterference + l.verticalClearance;
  const rb = l.clickDiameter / 2;
  const rd = rb + CLICK_DIMPLE_MARGIN;
  // 凹の球の中心は凸と同じ（フタ下面から rb - bumpH 上）。壁上面 zCut はそこから rb - bumpH + 縦隙間 下
  const dz = rb - bumpH + l.verticalClearance;
  const clickDimpleRadius = Math.sqrt(Math.max(rd * rd - dz * dz, 0));

  return {
    length,
    span,
    rotationDeg: entry.rotationDeg,
    openDir: entry.dir,
    zLid,
    zTop,
    zCut: zLid - l.verticalClearance,
    straightHeight: l.thickness - g,
    grooveCornerRadius,
    grooveWallMin,
    clickBumpHeight: bumpH,
    clickDimpleRadius,
    clickX: -(length / 2 + b.wallThickness / 2),
    clickYs: [-span / 4, span / 4],
  };
}
