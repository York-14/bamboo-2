/** Worker から UI へ渡す三角形メッシュ。Transferable で受け渡せるよう型付き配列だけで持つ */
export interface MeshData {
  /** x, y, z の繰り返し */
  positions: Float32Array;
  /** 三角形ごとの頂点インデックス 3 つの繰り返し */
  indices: Uint32Array;
}

/** 4x4 変換行列（列優先。three.js の Matrix4.fromArray と同じ並び） */
export type Mat4 = number[];

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export type PartGroup = 'main' | 'coupon';

export interface PartResult {
  /** 部品名。STL のファイル名にも使う */
  name: string;
  label: string;
  /** main: 本番の部品 / coupon: 嵌合テスト用の小片（プレビューには出さない） */
  group: PartGroup;
  /** 組み立てた状態の座標でのメッシュ */
  mesh: MeshData;
  /** 組み立て状態 → 印刷する向き・位置（Z=0 に接地）への変換。STL はこの変換を適用して書き出す */
  printMatrix: Mat4;
  volume: number;
}

export interface BuildResult {
  parts: PartResult[];
  /** フタを開ける方向（ワールド XY の単位ベクトル）と、完全に抜ける移動量。フタなしなら null */
  lidSlide: { dir: [number, number]; travel: number } | null;
}
