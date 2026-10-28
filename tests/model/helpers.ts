import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';
import type { MeshData } from '../../src/model/mesh';

let wasmPromise: Promise<ManifoldToplevel> | null = null;

export function loadWasm(): Promise<ManifoldToplevel> {
  wasmPromise ??= Module().then((w) => {
    w.setup();
    return w;
  });
  return wasmPromise;
}

export function bounds(mesh: MeshData) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], mesh.positions[i + k]);
      max[k] = Math.max(max[k], mesh.positions[i + k]);
    }
  }
  return { min, max, size: max.map((v, k) => v - min[k]) };
}

/** 水密性：すべての辺がちょうど 2 枚の三角形に、逆向きで共有されていること */
export function isWatertight(mesh: MeshData): boolean {
  const edges = new Map<string, number>();
  const { indices } = mesh;
  for (let t = 0; t < indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[t + k];
      const b = indices[t + ((k + 1) % 3)];
      const key = `${a},${b}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of edges) {
    if (count !== 1) return false;
    const [a, b] = key.split(',');
    if (edges.get(`${b},${a}`) !== 1) return false;
  }
  return true;
}

/** 角丸長方形の面積（真円近似） */
export function roundedRectArea(w: number, d: number, r: number): number {
  return w * d - (4 - Math.PI) * r * r;
}
