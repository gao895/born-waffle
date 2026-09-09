# AI Auto VRM Maker

3Dモデル（GLB / glTF）をブラウザにドラッグ＆ドロップするだけで、Humanoidボーンの自動認識・VRM 1.0メタ情報の設定・表情（Expressions）の自動マッピング・VRM書き出しまでを行えるWebアプリです。3DやVRMの専門知識がなくても、数クリックでVRMアバターを作成できることを目指しています。

サーバーへのアップロードは行わず、すべてブラウザ内（クライアントサイド）で処理します。

## セットアップ

```bash
npm install
npm run dev       # 開発サーバー起動 (http://localhost:5173)
npm run build     # 本番ビルド（型チェック + Vite build）
npm run preview   # ビルド済みアプリのプレビュー
npm run lint      # oxlint によるコード検査
```

Node.js 20以降を推奨します。

## 使い方

1. トップ画面に `.glb` または `.gltf` ファイルをドラッグ＆ドロップ（またはクリックして選択）
2. モデルが3D Viewerに表示され、自動的に構造解析（メッシュ数・ボーン数・人体判定・T/Aポーズ判定など）が行われる
3. 右パネルの「人型ボーン設定」で、Humanoidボーンへの自動マッピング結果を確認。必要なら手動でドロップダウンから修正
4. 「表情 (Expressions)」でモーフターゲットの自動マッピングを確認・修正
5. 「ゆれもの設定 (SpringBone)」で「SpringBoneを自動設定」を押すと、Humanoidに含まれないボーン（髪・スカート等）を検出
6. アバター情報（名前・作者など）を入力
7. 「VRMを作成」を押すとVRM 1.0ファイルが生成され、読み込んでプレビュー表示される
8. 「avatar.vrm をダウンロード」で保存

## 対応フォーマット

- 入力: `.glb`, `.gltf`（Skeleton/SkinnedMeshを含むモデルを想定）
- 出力: `.vrm`（VRM 1.0）
- ボーンを持たないモデルも読み込み可能で、「AIで自動リギングする」から形状ベースのヒューリスティックによる自動ボーン生成を試せます（後述の「自動リギングの説明」参照。完全な精度は保証されないβ機能です）

`.fbx` / `.obj` / `.vrm` の入力対応は将来のロードマップです。

## アーキテクチャ

```
src/
  components/   UIコンポーネント（React）
  three/        three.js を直接操作するロジック（フレームワーク非依存）
  hooks/        React hooks（useModel / useSkeleton / useVRM / useViewer）
  types/        型定義
  utils/        文字列正規化・スコアリングなどの純粋関数
```

- `three/SceneManager.ts`: シーン・カメラ・レンダラー・OrbitControls・グリッド・ボーンマーカーのクリック判定など、three.jsの生のシーン管理
- `three/ModelLoader.ts`: GLTFLoaderでの読み込みとメッシュ/ボーン/モーフターゲットの統計解析、リソース破棄
- `three/BoneDetector.ts` / `SkeletonAnalyzer.ts`: ボーン名の正規化・左右判定・階層情報の抽出、人体/ポーズ判定のヒューリスティック
- `three/HumanoidMapper.ts` + `humanoidAliases.ts`: VRM Humanoidボーンへの自動マッピング（後述）
- `three/MorphTargetAnalyzer.ts`: モーフターゲット名からVRM Expressionプリセットへの自動マッピング
- `three/SpringBoneManager.ts`: Humanoidに属さない末端ボーンチェーンの検出（SpringBone候補）
- `three/VRMBuilder.ts` / `VRMExporter.ts`: VRM 1.0の拡張データ組み立てとglTF拡張としての書き出し（後述）
- `three/VRMValidator.ts`: 必須Humanoidボーンのチェック
- `three/RiggingProvider.ts` + `AutoRigger.ts`: ボーンなしモデル向けの自動リギング抽象インターフェースと、その現行実装（形状ヒューリスティック、後述）

## 自動ボーンマッピングの説明

`three/BoneDetector.ts` で各ボーンを

- **正規化名**（`utils/normalizeBoneName.ts`: 大文字小文字・区切り文字・`mixamorig:`等のリグ接頭辞を吸収したトークン列）
- **左右判定**（`utils/detectSide.ts`: 名前のトークン、次点でX座標）
- **階層（親子関係・深さ）**

に分解し、`three/HumanoidMapper.ts` が VRM Humanoid の55ボーンそれぞれについて候補ボーンをスコアリングします（`utils/boneScoring.ts`）。

スコアの優先順位（設計仕様どおり）:

1. 名前の完全一致（正規化後）
2. 名前の部分一致（fuzzy similarity、閾値0.75以上）
3. 左右一致
4. 親ボーンが既にマッピング済みの親VRMボーンと一致
5. 体の高さに対する相対Y座標が期待範囲内か
6. 子ボーンを1つだけ持つか（末端でも分岐でもない「関節」らしさの簡易指標）

**しきい値について**: 部分一致の類似度しきい値や採用スコアの下限は、実際に "upperArm" と "lowerArm"、"upperLeg" と "upperChest" のような紛らわしい単語同士が誤って一致してしまう問題を検証した上で調整しています。特に、名前の手がかりが一切ない状態で構造的なボーナス（左右・親・位置）だけで採用してしまうと、UpperChestのような任意ボーンが存在しないモデルで、本来Neckなど別の必須ボーンが取るべきボーンを先に奪ってしまう事故が起きるため、しきい値は意図的に高めに設定しています。

マッピング結果は `confidence`（0-100%）と `source`（`exact` / `scored` / `manual` / `unmapped`）を持ち、UIのドロップダウンから手動修正すると `source: 'manual'` になります。「自動設定に戻す」でいつでも自動結果に戻せます。

## VRM Exportの実装説明

`@pixiv/three-vrm` は現時点で **VRMの読み込み専用ライブラリ**であり、VRMファイルの書き出し機能は提供していません（[pixiv/three-vrm#1114](https://github.com/pixiv/three-vrm/discussions/1114) で開発者自身がGLTFExporter向けプラグインの実用化が難しいと述べています）。そのため本アプリでは:

1. three.jsの `GLTFExporter`（`three/examples/jsm/exporters/GLTFExporter.js`）で、通常のGLB（バイナリglTF）としてシーン全体（メッシュ・マテリアル・テクスチャ・スキン・アニメーション）を書き出す
2. 独自の `GLTFExporterPlugin`（`VRMExtensionPlugin`、`three/VRMExporter.ts`）を登録し、`afterParse` フックで `writer.nodeMap`（Object3D → glTFノードindexの対応表）を使ってHumanoidボーン・モーフターゲットバインド・SpringBoneジョイントのノード参照を解決し、`VRMC_vrm` / `VRMC_springBone` という glTF 2.0 拡張のJSONを直接注入する

という方式でVRM 1.0を生成しています。拡張のスキーマ（`specVersion` / `meta` / `humanoid.humanBones` / `expressions.preset` / `expressions.custom` / `VRMC_springBone` の `colliders` / `colliderGroups` / `springs`）は [VRM仕様書 (vrm-c/vrm-specification)](https://github.com/vrm-c/vrm-specification) のJSON Schemaを直接参照して実装しており、拡張子だけを`.vrm`に変更したものではありません。

書き出し後は同じ `@pixiv/three-vrm` の `VRMLoaderPlugin` で生成直後のVRMを再読み込みし、Viewerにプレビュー表示します（`VRMExporter.ts` の `loadVRMPreview`）。これは公式ローダーで正しく解釈できることを都度確認する簡易的な検証も兼ねています。

MToonマテリアル（VRM独自のトゥーンシェーダー）の書き出しは行っていません。入力モデルは標準的なPBRマテリアル（MeshStandardMaterial等）を想定しており、そのままglTF標準のマテリアルとして書き出されます。

## 自動リギング（ボーンなしモデル）の説明

ボーンを持たないモデルは、右パネルの「AIで自動リギングする」から自動でHumanoidボーンを生成できます（`three/AutoRigger.ts` の `HeuristicRiggingProvider`）。姿勢推定AIやメッシュセグメンテーション（Pinocchio/RigNet等の研究分野）を使った「本物の」自動リギングではなく、**シルエット形状に基づくヒューリスティック**です:

1. 全頂点のワールド座標をサンプリングし、バウンディングボックスを取得
2. 標準的な人体プロポーション（8頭身相当の高さ比率）を仮定して、腰・背骨・胸・首・頭を高さ方向に配置
3. 腰より下の頂点X分布から「脚の間の隙間」を検出し、左右の脚位置を推定（隙間が見つからない場合はスカート等とみなし、中心から均等オフセット）
4. 肩幅と胴体幅を比較し、Tポーズ（腕を横に伸ばす）か腕を下げた姿勢かを判定して、それぞれに応じた腕ボーンを配置
5. 各頂点を、最も近いボーン線分（点と線分の最短距離）に基づいて上位2ボーンへスキンウェイトを割り当て（線形ブレンド）
6. 生成したボーンはVRM Humanoidの正式名称（`hips`, `leftUpperArm`等）で命名するため、既存の`BoneDetector`/`HumanoidMapper`パイプラインがそのまま高信頼度でマッチする

**既知の限界**: 腕が複雑なポーズ（体に密着、武器を握る等）の場合や、脚がスカート等で完全に隠れている場合は、ボーン位置がずれることがあります。生成後は「詳細設定」から手動でボーンを再割り当てできます。将来的にMediaPipe等の姿勢推定AIや外部Auto Rigging APIに差し替える場合は、`three/RiggingProvider.ts` の `RiggingProvider` インターフェース（`detectSkeleton` / `generateSkeleton` / `skinMesh` / `mapHumanoid`）に沿って新しい実装を追加するだけで済みます。

## ロードマップ

- **V1**: 既存Skeletonを持つGLB/GLTFのHumanoid自動マッピング → VRM 1.0書き出し
- **V2（現在）**: ボーンなしモデルへの自動リギング（形状ヒューリスティック、上記参照）
- **V3**: 姿勢推定AIによる高精度リギング・Tポーズ化・自動ウェイト改善・表情・SpringBoneまでの完全自動化
- **V4**: メタバース向け最適化（ポリゴン削減・テクスチャ圧縮・VRM軽量化）

その他、FBX/OBJ/VRM入力対応、VRM0/VRM1切り替え、アニメーションプレビュー、Lip Sync等は将来検討事項です。

## 使用ライブラリ

| ライブラリ | 用途 |
| --- | --- |
| React 19 / TypeScript / Vite | アプリ基盤 |
| three.js | 3Dレンダリング・GLTFLoader/Exporter |
| @pixiv/three-vrm | VRM 1.0の読み込み・Humanoid/Expression/SpringBoneの型定義 |
| Tailwind CSS 4 | スタイリング |
| lucide-react | アイコン |

## ライセンス

このリポジトリのコードはプロジェクトのライセンスに従います。生成されるVRMファイルの利用条件は、アプリ内で設定するメタ情報（ライセンスURL・利用可能性など）に基づき、ユーザー自身の責任で設定してください。
