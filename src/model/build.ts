import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { CaseParams } from './params';
import type { BuildResult, MeshData } from './mesh';
import { buildBody } from './geometry/body';
import { Scope } from './geometry/scope';

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

/**
 * パラメータから部品ごとのメッシュを作る。
 * 事前に validate() でエラーがないことを確認してから呼ぶこと。
 * 部品は印刷する向きで、Z=0 に接地した状態で返す。
 */
export function buildCase(wasm: ManifoldToplevel, p: CaseParams): BuildResult {
  const scope = new Scope();
  try {
    const body = buildBody(wasm, scope, p);
    const status = body.status();
    if (status !== 'NoError') {
      throw new Error(`本体の形状生成に失敗しました: ${status}`);
    }
    return {
      parts: [{ name: 'body', label: '本体', mesh: toMeshData(body), volume: body.volume() }],
    };
  } finally {
    scope.dispose();
  }
}
