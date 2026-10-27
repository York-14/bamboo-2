# bamboo-2 — Case Generator

FDM 3D プリンタ向けの、パラメトリックなケース（スライドフタ付き角丸ボックス）を
ブラウザ上で設計・プレビューし、STL で出力する個人用ツール。

要件は [docs/requirements.md](docs/requirements.md) を参照。

## 使い方

```sh
npm install
npm run dev      # 表示された URL（既定 http://localhost:5173）を Chrome で開く
```

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm test` | 形状生成・入力検証・STL 出力のテスト（Node 上で manifold を実行） |
| `npm run typecheck` | 型チェック |
| `npm run build` | 静的ファイルを `dist/` に出力 |

## 構成

```
src/
  model/      形状計算（UI に依存しない）。params → validate → build
  worker/     manifold-3d (WASM) を Web Worker で実行
  export/     バイナリ STL 書き出し
  state/      パラメータの状態管理（localStorage に自動保存）
  ui/         React コンポーネントと 3D プレビュー
tests/model/  Vitest
```

座標系は Z 上向き、原点は本体外形の底面中心。単位は mm。

## 進捗

- [x] ステップ 1：本体（内寸指定・壁厚・底厚・角の丸み・底面の面取り）、プレビュー、STL 出力
- [ ] ステップ 2：スライドフタ、嵌合テスト用の小片
- [ ] ステップ 3：仕切り
- [ ] ステップ 4：穴
- [ ] ステップ 5：抜け止め
- [ ] ステップ 6：着脱式仕切りほか
