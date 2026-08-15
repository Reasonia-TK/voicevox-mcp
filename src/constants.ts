export const PACKAGE_NAME = 'voicevox-mcp';
export const PACKAGE_VERSION = '0.1.0';

export const DEFAULT_CHARACTER = 'ずんだもん';
export const DEFAULT_STYLE = 'ノーマル';
export const DEFAULT_SPEED_SCALE = 1.1;
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 50021;
export const DEFAULT_MAX_TEXT_LENGTH = 1_000;

export const SERVER_INSTRUCTIONS = [
  '重要: 通常の途中経過ではspeakを呼ばない。最終回答、作業完了、エラー、ユーザー確認待ちの直前だけ、画面に表示する結論と同じ内容を自然なずんだもん口調の2〜4文・180文字以内に要約してspeakへ渡す。',
  'コード、コマンド、URL、秘密情報、長いファイルパスは読み上げない。生成する文書・コード・コメントは通常の文体にする。',
  '音声の失敗で本来の回答を止めず、必要ならvoicevox_statusで原因を確認する。stop_speakingは現在の再生と待機中の音声を取り消す場合だけ使う。',
].join('');
