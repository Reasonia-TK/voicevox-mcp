# リリース手順

この文書はメンテナー向けです。npm公開とGitHub Release作成は外部への変更になるため、内容を確認してから手動で実行してください。

## 1. バージョンを更新する

次の3か所を同じSemVerへ更新します。

- `package.json`
- `src/constants.ts`の`PACKAGE_VERSION`
- `mcpb/manifest.json`の`version`

確認:

```powershell
npm.cmd run version:check
```

## 2. 品質ゲートを実行する

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run smoke:stdio
npm.cmd audit --omit=dev
npm.cmd pack --dry-run
```

起動済みVOICEVOXがあるWindows環境では、音を鳴らさない実機確認も行います。

```powershell
npm.cmd run smoke:live
```

自動起動を検証するために、利用中のVOICEVOXを強制終了しないでください。自動起動分岐は単体テストで検証します。

## 3. MCPBを作成する

```powershell
npm.cmd run mcpb:stage
npm.cmd run mcpb:validate
npm.cmd run mcpb:pack
```

`build\voicevox-mcp.mcpb`が生成されます。MCPBをClaude Desktopへ手動インストールし、ツール一覧と短い読み上げを確認します。

## 4. npmへ公開する

パッケージ名が利用可能であることと、npmアカウントの2要素認証を確認します。

```powershell
npm.cmd view voicevox-mcp version
npm.cmd login
npm.cmd publish --access public
```

初回公開前に、`package.json`へ実際のGitHubリポジトリURL、author、bugs、homepageを設定してください。npm Trusted Publishingとprovenanceを使う場合は、GitHubリポジトリ作成後に専用の公開ワークフローを別途設定します。

## 5. GitHub Releaseを作成する

1. バージョンタグ（例: `v0.1.0`）を作成する。
2. 同じバージョン名でGitHub Releaseを作成する。
3. `build\voicevox-mcp.mcpb`を添付する。
4. npmのバージョンとMCPBのマニフェストが一致していることを再確認する。
5. リリースノートへ対応Windows、必要なVOICEVOX、主な変更、既知の制約を書く。
