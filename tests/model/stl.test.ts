import { describe, expect, it } from 'vitest';
import { meshToStl } from '../../src/export/stl';

describe('STL 出力', () => {
  it('三角形数と頂点・法線が正しく書き出される', () => {
    const mesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };
    const buf = meshToStl(mesh);
    expect(buf.byteLength).toBe(84 + 50);
    const view = new DataView(buf);
    expect(view.getUint32(80, true)).toBe(1);
    // 法線は +Z
    expect(view.getFloat32(84 + 8, true)).toBeCloseTo(1);
    // 2 番目の頂点の x
    expect(view.getFloat32(84 + 24, true)).toBe(1);
  });
});
