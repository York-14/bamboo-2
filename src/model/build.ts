import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { CaseParams } from './params';
import { deriveDims, deriveLidDims } from './derive';
import { IDENTITY, type BuildResult, type Mat4, type MeshData, type PartGroup, type PartResult } from './mesh';
import { buildBodyShell } from './geometry/body';
import { buildLid, buildLidCuts } from './geometry/lid';
import { Scope } from './geometry/scope';

export interface CaseManifolds {
  body: Manifold;
  lid: Manifold | null;
}

/**
 * 組み立てた状態の本体とフタを作る（ワールド座標）。
 * 生成したオブジェクトは scope に登録されるので、呼び出し側で解放すること。
 */
export function buildCaseManifolds(wasm: ManifoldToplevel, scope: Scope, p: CaseParams): CaseManifolds {
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
    return { parts, lidSlide };
  } finally {
    scope.dispose();
  }
}
