import type { Mat4, MeshData } from '../model/mesh';

/** バイナリ STL（ヘッダ 80 byte + 三角形数 + 三角形ごとに 50 byte） */
export function meshToStl(mesh: MeshData, header = 'bamboo case generator'): ArrayBuffer {
  const { positions: p, indices } = mesh;
  const triCount = indices.length / 3;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);

  const headerBytes = new TextEncoder().encode(header.slice(0, 80));
  new Uint8Array(buffer, 0, headerBytes.length).set(headerBytes);
  view.setUint32(80, triCount, true);

  let offset = 84;
  for (let t = 0; t < triCount; t++) {
    const a = indices[t * 3] * 3;
    const b = indices[t * 3 + 1] * 3;
    const c = indices[t * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);
    offset += 12;
    for (const v of [a, b, c]) {
      view.setFloat32(offset, p[v], true);
      view.setFloat32(offset + 4, p[v + 1], true);
      view.setFloat32(offset + 8, p[v + 2], true);
      offset += 12;
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return buffer;
}

/** 4x4 行列（列優先）を頂点に適用したメッシュを返す。回転と平行移動のみを想定（向きは保たれる） */
export function transformMesh(mesh: MeshData, m: Mat4): MeshData {
  const src = mesh.positions;
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i], y = src[i + 1], z = src[i + 2];
    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  return { positions: out, indices: mesh.indices };
}
