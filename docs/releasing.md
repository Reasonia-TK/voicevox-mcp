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

## 4. npm Trusted Publishingを設定する（初回のみ）

npmの`voicevox-mcp`パッケージ設定で、Trusted Publisherへ次のGitHub Actionsを登録します。

| 項目 | 値 |
| --- | --- |
| Organization or user | `Reasonia-TK` |
| Repository | `voicevox-mcp` |
| Workflow filename | `publish.yml` |
| Environment name | 未指定 |
| Allowed actions | `npm publish` |

`.github/workflows/publish.yml`は`v*`タグのpushで起動します。Node.js 24、npm 11.5.1、GitHubホストのWindows runnerを使い、`id-token: write`でOIDC認証します。長期npmトークンやGitHub Actions Secretは使いません。Trusted Publishingではprovenanceも自動生成されます。

Trusted Publisherの動作確認後は、npmパッケージ設定のPublishing accessを`Require two-factor authentication and disallow tokens`へ変更し、不要な公開用アクセストークンを失効してください。

## 5. npmへ公開する

バージョン更新と品質ゲートをコミットして`main`へpushした後、同じバージョンのタグをpushします。

```powershell
git tag v0.2.0
git push origin v0.2.0
```

`Publish npm`ワークフローはタグ名と`package.json`のバージョン一致を確認してから公開します。不一致なら公開せず失敗します。

## 6. GitHub Releaseを作成する

1. バージョンタグ（例: `v0.1.0`）を作成する。
2. 同じバージョン名でGitHub Releaseを作成する。
3. `build\voicevox-mcp.mcpb`を添付する。
4. npmのバージョンとMCPBのマニフェストが一致していることを再確認する。
5. リリースノートへ対応Windows、必要なVOICEVOX、主な変更、既知の制約を書く。
