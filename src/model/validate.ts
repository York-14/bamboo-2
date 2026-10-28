import type { CaseParams } from './params';
import { deriveDims, deriveLidDims } from './derive';

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
