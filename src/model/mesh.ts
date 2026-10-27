/** Worker から UI へ渡す三角形メッシュ。Transferable で受け渡せるよう型付き配列だけで持つ */
export interface MeshData {
  /** x, y, z の繰り返し */
  positions: Float32Array;
  /** 三角形ごとの頂点インデックス 3 つの繰り返し */
  indices: Uint32Array;
}

export interface PartResult {
  /** 部品名。STL のファイル名にも使う */
  name: string;
  label: string;
  mesh: MeshData;
  volume: number;
}

export interface BuildResult {
  parts: PartResult[];
}
