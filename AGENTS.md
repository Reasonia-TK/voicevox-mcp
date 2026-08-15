# Voicevox MCP 開発ルール

- Windows 11、PowerShell、Node.js 22以上を主対象とする。
- MCPの標準出力はプロトコル専用とし、ログは必ず標準エラーへ出す。
- VOICEVOX Engineはループバック接続を既定とし、自動ダウンロードやGUI起動は行わない。
- 音声・読み上げ本文・利用者のパスを既定でログへ保存しない。
- 依存関係は最小限に保ち、ネイティブアドオン、VLC、ffmpegへ依存しない。
- 変更後は `npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run build` を実行する。
- 公開仕様を変えた場合はREADME、設定例、テストを同時に更新する。
