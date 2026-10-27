import type { CaseParams } from './params';
import { deriveDims } from './derive';

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
  return issues;
}

export function hasError(issues: Issue[]): boolean {
  return issues.some((i) => i.level === 'error');
}
