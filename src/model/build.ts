import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { CaseParams } from './params';
import { deriveDims, deriveLayerDims, deriveLidDims } from './derive';
import { IDENTITY, type BuildResult, type Mat4, type MeshData, type PartGroup, type PartResult } from './mesh';
import { buildBodyShell } from './geometry/body';
import { buildDividers } from './geometry/dividers';
import { buildHoleCutters } from './geometry/holes';
import { buildRetainers } from './geometry/retainers';
import { buildLayerLedge, buildLayerPlate } from './geometry/layer';
import { buildLid, buildLidCuts } from './geometry/lid';
import { Scope } from './geometry/scope';

export interface CaseManifolds {
  body: Manifold;
  lid: Manifold | null;
  /** 中板（別部品）。中板なしなら null */
  plate?: Manifold | null;
}

/**
 * 組み立てた状態の本体とフタを作る（ワールド座標）。
 * 生成したオブジェクトは scope に登録されるので、呼び出し側で解放すること。
 */
export function buildCaseManifolds(wasm: ManifoldToplevel, scope: Scope, p: CaseParams): CaseManifolds {
  const { body: shell, lid: plainLid } = buildBodyAndLid(wasm, scope, p);
  // 仕切りはワールド座標で作って足す（本体の外形＝凸包で切り取る）
  const hull = scope.keep(shell.hull());
  const dividers = buildDividers(wasm, scope, p, hull);
  let body = dividers ? scope.keep(shell.add(dividers)) : shell;
  const retainers = buildRetainers(wasm, scope, p, hull);
  if (retainers) body = scope.keep(body.add(retainers));
  const plate = p.layer.enabled ? buildLayerPlate(wasm, scope, p) : null;
  if (p.layer.enabled) {
    const ledge = scope.keep(buildLayerLedge(wasm, scope, p).intersect(hull));
    body = scope.keep(body.add(ledge));
  }
  let lid = plainLid;
  // 穴は最後に開ける（仕切りが壁に食い込んだ部分も含めて貫通させる）
  const cutters = buildHoleCutters(wasm, scope, p);
  if (cutters.body) body = scope.keep(body.subtract(cutters.body));
  if (cutters.lid && lid) lid = scope.keep(lid.subtract(cutters.lid));
  return { body, lid, plate };
}

function buildBodyAndLid(wasm: ManifoldToplevel, scope: Scope, p: CaseParams): CaseManifolds {
  const d = deriveDims(p);
  if (!p.lid.enabled) {
    const { shell } = buildBodyShell(wasm, scope, p, p.body.innerWidth, p.body.innerDepth, d.outerHeight);
    return { body: shell, lid: null };
  }
  // フタまわりは差し込み側が -X のフレームで作ってから回転する
  const ld = deriveLidDims(p);
  const { shell, outerProfile } = buildBodyShell(wasm, scope, p, ld.length, ld.span, d.outerHeight);
  const cuts = buildLidCuts(wasm, scope, p, ld);
  const body = scope.keep(shell.subtract(cuts));
  const lid = buildLid(wasm, scope, p, ld, outerProfile);
  return {
    body: scope.keep(body.rotate(0, 0, ld.rotationDeg)),
    lid: scope.keep(lid.rotate(0, 0, ld.rotationDeg)),
  };
}

function toMeshData(m: Manifold): MeshData {
  const mesh = m.getMesh();
  const { numProp, vertProperties, triVerts } = mesh;
  let positions: Float32Array;
  if (numProp === 3) {
    positions = new Float32Array(vertProperties);
  } else {
    const n = vertProperties.length / numProp;
    positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = vertProperties[i * numProp];
      positions[i * 3 + 1] = vertProperties[i * numProp + 1];
      positions[i * 3 + 2] = vertProperties[i * numProp + 2];
    }
  }
  return { positions, indices: new Uint32Array(triVerts) };
}

/** フタを上下反転（X 軸回りに 180°）して上面を Z=0 に置き、本体の奥（+Y）に並べる */
/** 中板は平置きのまま Z=0 に下ろし、本体の手前（-Y）に並べる */
function platePrintMatrix(p: CaseParams): Mat4 {
  const d = deriveDims(p);
  const gap = 10;
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -(d.outerDepth + gap), -deriveLayerDims(p).zBottom, 1];
}

function lidPrintMatrix(p: CaseParams): Mat4 {
  const d = deriveDims(p);
  const gap = 10;
  return [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, d.outerDepth + gap, d.outerHeight, 1];
}

function toPart(m: Manifold, name: string, label: string, group: PartGroup, printMatrix: Mat4): PartResult {
  const status = m.status();
  if (status !== 'NoError') {
    throw new Error(`${label}の形状生成に失敗しました: ${status}`);
  }
  return { name, label, group, mesh: toMeshData(m), printMatrix, volume: m.volume() };
}

/** 嵌合テスト用の小片：同じ壁・溝・フタ設定で、内寸を小さく・浅くしたケース */
export function couponParams(p: CaseParams): CaseParams {
  const body = {
    ...p.body,
    innerWidth: 20,
    innerDepth: 30,
    innerHeight: 3,
    bottomChamfer: 0,
  };
  body.cornerRadius = Math.min(body.cornerRadius, (body.innerWidth + 2 * body.wallThickness) / 2);
  return {
    ...p,
    body,
    lid: { ...p.lid, enabled: true, entrySide: '-x' },
    dividers: {
      ...p.dividers,
      x: { ...p.dividers.x, enabled: false },
      y: { ...p.dividers.y, enabled: false },
    },
    holes: [],
    retainers: [],
    layer: { ...p.layer, enabled: false },
  };
}

/**
 * パラメータから部品ごとのメッシュを作る。
 * 事前に validate() でエラーがないことを確認してから呼ぶこと。
 */
export function buildCase(wasm: ManifoldToplevel, p: CaseParams): BuildResult {
  const scope = new Scope();
  try {
    const main = buildCaseManifolds(wasm, scope, p);
    const parts: PartResult[] = [toPart(main.body, 'body', '本体', 'main', IDENTITY)];
    let lidSlide: BuildResult['lidSlide'] = null;

    if (main.lid) {
      parts.push(toPart(main.lid, 'lid', 'フタ', 'main', lidPrintMatrix(p)));
      const ld = deriveLidDims(p);
      lidSlide = { dir: ld.openDir, travel: ld.length + 2 * p.body.wallThickness + 5 };

      const cp = couponParams(p);
      const coupon = buildCaseManifolds(wasm, scope, cp);
      parts.push(toPart(coupon.body, 'coupon-body', 'テスト片 本体', 'coupon', IDENTITY));
      parts.push(toPart(coupon.lid!, 'coupon-lid', 'テスト片 フタ', 'coupon', lidPrintMatrix(cp)));
    }
    if (main.plate) {
      // 本番の部品の並び（本体・フタ・中板）を保つため、テスト片より前に入れる
      const at = parts.findIndex((x) => x.group === 'coupon');
      const plate = toPart(main.plate, 'plate', '中板', 'main', platePrintMatrix(p));
      if (at < 0) parts.push(plate);
      else parts.splice(at, 0, plate);
    }
    return { parts, lidSlide };
  } finally {
    scope.dispose();
  }
}
