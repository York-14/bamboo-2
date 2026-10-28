import type { CaseParams, HoleParams } from './params';
import { deriveDims, deriveDividerLayout, deriveLidDims } from './derive';
import { boxesOverlap, faceBox, holeCenters, holeExtent, isWallFace, patternExtent, usesHeight, type Box3 } from './holes';

export type IssueLevel = 'error' | 'warning';

export interface Issue {
  level: IssueLevel;
  /** 対象パラメータのパス（例: "body.wallThickness"）。UI で入力欄を強調するのに使う */
  path: string;
  message: string;
}

/** エラーが 1 つでもあれば形状は生成しない。警告は生成したうえで表示する */
export function validate(p: CaseParams): Issue[] {
  const issues: Issue[] = [];
  const b = p.body;
  const err = (path: string, message: string) => issues.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ level: 'warning', path, message });

  const positive: [keyof typeof b, string][] = [
    ['innerWidth', '内寸 横'],
    ['innerDepth', '内寸 縦'],
    ['innerHeight', '内寸 高さ'],
    ['wallThickness', '壁厚'],
    ['bottomThickness', '底厚'],
  ];
  for (const [key, label] of positive) {
    if (!(b[key] > 0)) err(`body.${key}`, `${label}は 0 より大きくしてください`);
  }
  if (b.cornerRadius < 0) err('body.cornerRadius', '角の丸みは 0 以上にしてください');
  if (b.bottomChamfer < 0) err('body.bottomChamfer', '底面の面取りは 0 以上にしてください');
  if (p.print.circularSegments < 8) err('print.circularSegments', '円弧の分割数は 8 以上にしてください');
  const l = p.lid;
  if (l.enabled) {
    if (!(l.thickness > 0)) err('lid.thickness', 'フタ厚は 0 より大きくしてください');
    if (!(l.grooveDepth > 0)) err('lid.grooveDepth', '溝の深さは 0 より大きくしてください');
    if (l.sideClearance < 0) err('lid.sideClearance', '横方向の隙間は 0 以上にしてください');
    if (l.verticalClearance < 0) err('lid.verticalClearance', '厚み方向の隙間は 0 以上にしてください');
    if (l.cornerMode === 'reduced' && l.cornerRadius < 0) err('lid.cornerRadius', 'フタの角の丸みは 0 以上にしてください');
    if (l.clickEnabled) {
      if (!(l.clickInterference > 0)) err('lid.clickInterference', 'クリックの引っかかり量は 0 より大きくしてください');
      if (!(l.clickDiameter > 0)) err('lid.clickDiameter', 'クリックの直径は 0 より大きくしてください');
    }
  }
  if (issues.some((i) => i.level === 'error')) return issues;

  const d = deriveDims(p);
  const maxRadius = Math.min(d.outerWidth, d.outerDepth) / 2;
  if (b.cornerRadius > maxRadius) {
    err('body.cornerRadius', `角の丸みは外寸の短辺の半分（${maxRadius.toFixed(1)} mm）以下にしてください`);
  }
  if (b.bottomChamfer >= b.bottomThickness) {
    err('body.bottomChamfer', '底面の面取りは底厚より小さくしてください');
  } else if (b.bottomChamfer > b.wallThickness) {
    warn('body.bottomChamfer', '底面の面取りが壁厚より大きいため、底の角で壁が薄くなります');
  }

  if (b.wallThickness < p.print.minWall) {
    warn('body.wallThickness', `壁厚が最小壁厚（${p.print.minWall} mm）より薄いです`);
  }
  if (b.bottomThickness < p.print.minWall) {
    warn('body.bottomThickness', `底厚が最小壁厚（${p.print.minWall} mm）より薄いです`);
  }
  if (b.wallThickness < p.print.nozzleDiameter * 2) {
    warn('body.wallThickness', `壁厚がノズル径の 2 倍（${p.print.nozzleDiameter * 2} mm）未満で、きれいに印刷できない可能性があります`);
  }
  if (l.enabled) validateLid(p, err, warn);
  validateDividers(p, err, warn);
  for (const hole of p.holes) validateHole(p, hole, err, warn);
  return issues;
}

export function hasError(issues: Issue[]): boolean {
  return issues.some((i) => i.level === 'error');
}

type Report = (path: string, message: string) => void;

function validateLid(p: CaseParams, err: Report, warn: Report): void {
  const b = p.body;
  const l = p.lid;
  const ld = deriveLidDims(p);

  if (l.thickness <= l.grooveDepth) {
    // フタの縁は「垂直部分 + 45° 面取り（溝の深さ分）」なので、フタ厚が溝の深さ以下だと作れない
    err('lid.thickness', `フタ厚は溝の深さ（${l.grooveDepth} mm）より厚くしてください`);
    return;
  }
  if (l.sideClearance >= l.grooveDepth) {
    err('lid.sideClearance', '横方向の隙間は溝の深さより小さくしてください（フタが溝に掛からなくなります）');
    return;
  }
  if (l.verticalClearance >= b.innerHeight) {
    err('lid.verticalClearance', '厚み方向の隙間が内寸の高さ以上です');
    return;
  }
  if (ld.grooveWallMin <= 0) {
    err('lid.grooveDepth', '溝が壁を突き抜けます。溝を浅くするか壁を厚くしてください');
    return;
  }
  if (ld.grooveWallMin < p.print.minWall - 1e-6) {
    warn(
      'lid.grooveDepth',
      `溝の部分で残る壁が ${ld.grooveWallMin.toFixed(2)} mm と、最小壁厚（${p.print.minWall} mm）より薄くなります`,
    );
  }
  if (ld.straightHeight < p.print.nozzleDiameter) {
    warn('lid.thickness', 'フタの縁の垂直部分が薄く、溝から外れやすくなります。フタ厚を溝の深さ + 0.4 mm 以上にしてください');
  }
  if (l.thickness < p.print.minWall) {
    warn('lid.thickness', `フタ厚が最小壁厚（${p.print.minWall} mm）より薄いです`);
  }
  if (l.clickEnabled) {
    if (l.clickInterference >= l.clickDiameter / 2) {
      warn('lid.clickInterference', 'クリックの引っかかり量が直径の半分以上あり、硬すぎるか外れなくなる可能性があります');
    }
    if (ld.clickDimpleRadius * 2 > b.wallThickness - 0.4) {
      warn('lid.clickDiameter', 'クリック凹が壁の上面からはみ出しそうです。直径を小さくするか壁を厚くしてください');
    }
    const straightHalfSpan = ld.span / 2 - Math.max(b.cornerRadius - b.wallThickness, 0);
    if (Math.max(...ld.clickYs.map(Math.abs)) + ld.clickDimpleRadius > straightHalfSpan) {
      warn('lid.clickDiameter', 'クリックの位置が壁の角の丸みにかかっています');
    }
  }
}

function validateDividers(p: CaseParams, err: Report, warn: Report): void {
  const dv = p.dividers;
  if (!dv.x.enabled && !dv.y.enabled) return;
  const b = p.body;
  const t = dv.thickness;

  if (!(t > 0)) {
    err('dividers.thickness', '仕切りの厚みは 0 より大きくしてください');
    return;
  }
  if (t < p.print.nozzleDiameter * 2) {
    warn('dividers.thickness', `仕切りの厚みがノズル径の 2 倍（${p.print.nozzleDiameter * 2} mm）未満です`);
  }

  const layout = deriveDividerLayout(p);
  if (dv.heightMode === 'full') {
    if (dv.topClearance < 0) err('dividers.topClearance', 'フタとの隙間は 0 以上にしてください');
    else if (layout.maxHeight <= 0) err('dividers.topClearance', 'フタとの隙間が内寸の高さ以上です');
  } else if (!(dv.height > 0)) {
    err('dividers.height', '仕切りの高さは 0 より大きくしてください');
  } else if (dv.height > layout.maxHeight + 1e-9) {
    err(
      'dividers.height',
      p.lid.enabled
        ? `仕切りがフタに当たります。高さは ${layout.maxHeight.toFixed(1)} mm 以下にしてください（内寸高さ − フタとの隙間）`
        : `仕切りの高さは内寸の高さ（${b.innerHeight} mm）以下にしてください`,
    );
  }

  const sets = [
    { key: 'x', set: dv.x, length: b.innerWidth, label: '横' },
    { key: 'y', set: dv.y, length: b.innerDepth, label: '縦' },
  ] as const;
  for (const { key, set, length, label } of sets) {
    if (!set.enabled) continue;
    if (set.mode === 'equal') {
      if (!Number.isInteger(set.divisions) || set.divisions < 1) {
        err(`dividers.${key}.divisions`, '区画数は 1 以上の整数にしてください');
        continue;
      }
      const cell = (length - (set.divisions - 1) * t) / set.divisions;
      if (cell <= 0) err(`dividers.${key}.divisions`, `${label}方向の区画数が多すぎます`);
      else if (cell < 5) warn(`dividers.${key}.divisions`, `${label}方向の区画の内寸が ${cell.toFixed(1)} mm と狭くなります`);
      continue;
    }
    if (set.positions.length === 0) {
      warn(`dividers.${key}.positions`, `${label}方向の仕切り位置が指定されていません`);
      continue;
    }
    const sorted = [...set.positions].sort((a, c) => a - c);
    if (sorted.some((pos) => pos - t / 2 <= 0 || pos + t / 2 >= length)) {
      err(`dividers.${key}.positions`, `仕切りの位置は ${(t / 2).toFixed(1)}〜${(length - t / 2).toFixed(1)} mm の範囲にしてください`);
      continue;
    }
    const gaps = [sorted[0] - t / 2, ...sorted.slice(1).map((v, i) => v - sorted[i] - t), length - sorted[sorted.length - 1] - t / 2];
    if (gaps.some((g) => g <= 0)) err(`dividers.${key}.positions`, '仕切り同士が重なっています');
    else if (gaps.some((g) => g < 5)) warn(`dividers.${key}.positions`, '幅 5 mm 未満の狭い区画があります');
  }

  if (dv.notchShape !== 'none') {
    if (!(dv.notchWidth > 0)) err('dividers.notchWidth', '切り欠きの幅は 0 より大きくしてください');
    if (!(dv.notchDepth > 0)) err('dividers.notchDepth', '切り欠きの深さは 0 より大きくしてください');
    else if (dv.notchDepth >= layout.height) err('dividers.notchDepth', '切り欠きの深さは仕切りの高さより小さくしてください');
    const shortest = Math.min(
      ...layout.placements.flatMap((pl) => pl.segments.map((s) => s.to - s.from)),
    );
    if (dv.notchWidth > 0 && dv.notchWidth > shortest - 2 * t) {
      warn('dividers.notchWidth', `切り欠きの幅が区画の幅（最小 ${shortest.toFixed(1)} mm）に対して広すぎます`);
    }
  }
}

const FACE_LABEL: Record<HoleParams['face'], string> = {
  front: '手前の壁',
  back: '奥の壁',
  left: '左の壁',
  right: '右の壁',
  bottom: '底面',
  lid: 'フタ',
};

/** 仕切り板が占める範囲（壁・底への食い込み分を含む） */
function dividerBoxes(p: CaseParams): Box3[] {
  const b = p.body;
  const t = p.dividers.thickness;
  const layout = deriveDividerLayout(p);
  const zMin = b.bottomThickness / 2;
  const reachY = b.innerDepth / 2 + b.wallThickness / 2;
  const reachX = b.innerWidth / 2 + b.wallThickness / 2;
  return layout.placements.map((pl) =>
    pl.axis === 'x'
      ? { min: [pl.center - t / 2, -reachY, zMin], max: [pl.center + t / 2, reachY, layout.zTop] }
      : { min: [-reachX, pl.center - t / 2, zMin], max: [reachX, pl.center + t / 2, layout.zTop] },
  );
}

function validateHole(p: CaseParams, hole: HoleParams, err: Report, warn: Report): void {
  const path = `holes.${hole.id}`;
  const b = p.body;
  const comp = p.print.holeCompensation;

  if (!(hole.width > 0)) return err(path, '穴の幅（直径）は 0 より大きくしてください');
  if (usesHeight(hole) && !(hole.height > 0)) return err(path, '穴の高さは 0 より大きくしてください');
  if (hole.shape === 'roundRect' && hole.cornerRadius < 0) return err(path, '角の丸みは 0 以上にしてください');
  const { cols, rows, pitchU, pitchV } = hole.pattern;
  if (![cols, rows].every((n) => Number.isInteger(n) && n >= 1)) return err(path, '配列の個数は 1 以上の整数にしてください');
  if ((cols > 1 && !(pitchU > 0)) || (rows > 1 && !(pitchV > 0))) return err(path, '配列の間隔は 0 より大きくしてください');
  if (hole.face === 'lid' && !p.lid.enabled) return err(path, 'フタがないため、フタの穴は開けられません');

  const single = holeExtent(hole, comp);
  if ((cols > 1 && pitchU < single.uMax - single.uMin) || (rows > 1 && pitchV < single.vMax - single.vMin)) {
    warn(path, '配列の間隔が穴の大きさより狭く、穴同士がつながります');
  }

  const e = patternExtent(hole, comp);
  const d = deriveDims(p);
  const label = FACE_LABEL[hole.face];
  const innerR = Math.max(b.cornerRadius - b.wallThickness, 0);

  if (isWallFace(hole.face)) {
    const innerLen = hole.face === 'front' || hole.face === 'back' ? b.innerWidth : b.innerDepth;
    const uAbs = Math.max(-e.uMin, e.uMax);
    if (uAbs > innerLen / 2 + b.wallThickness || e.vMin < 0 || e.vMax > d.outerHeight) {
      return err(path, `穴が${label}からはみ出しています`);
    }
    if (uAbs > innerLen / 2 - innerR) warn(path, `穴が${label}の角（丸み・隣の壁）にかかっています`);
    if (e.vMin < b.bottomThickness) warn(path, `穴が底面の高さ（${b.bottomThickness} mm）より下にかかっています`);
    if (p.lid.enabled && e.vMax > deriveLidDims(p).zCut - 0.3) {
      warn(path, `穴がフタの溝の高さ（${deriveLidDims(p).zCut.toFixed(1)} mm）にかかっています`);
    }
  } else {
    // 底面・フタ：内側の空間の範囲に収まっているか
    const halfU = b.innerWidth / 2;
    const halfV = b.innerDepth / 2;
    if (e.uMin < -d.outerWidth / 2 || e.uMax > d.outerWidth / 2 || e.vMin < -d.outerDepth / 2 || e.vMax > d.outerDepth / 2) {
      return err(path, `穴が${label}からはみ出しています`);
    }
    const corner = Math.max(Math.abs(e.uMin), Math.abs(e.uMax)) > halfU - innerR &&
      Math.max(Math.abs(e.vMin), Math.abs(e.vMax)) > halfV - innerR;
    if (e.uMin < -halfU || e.uMax > halfU || e.vMin < -halfV || e.vMax > halfV || corner) {
      warn(path, `穴が${label}の内側の範囲からはみ出し、壁${hole.face === 'lid' ? 'や溝' : ''}にかかっています`);
    }
  }

  if (hole.face !== 'lid') {
    const dbs = dividerBoxes(p);
    const hit = holeCenters(hole).some(([u, v]) => {
      const box = faceBox(p, hole.face, {
        uMin: u + single.uMin,
        uMax: u + single.uMax,
        vMin: v + single.vMin,
        vMax: v + single.vMax,
      });
      return dbs.some((db) => boxesOverlap(box, db));
    });
    if (hit) warn(path, '穴が仕切りと重なっています');
  }
}
