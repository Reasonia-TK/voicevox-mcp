import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { VoicevoxMcpError } from '../src/errors.js';

describe('loadConfig', () => {
  it('Windows向けの安全な既定値を読み込む', () => {
    const config = loadConfig({ LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' });

    expect(config.endpoint.href).toBe('http://127.0.0.1:50021/');
    expect(config.defaultCharacter).toBe('ずんだもん');
    expect(config.defaultStyle).toBe('ノーマル');
    expect(config.defaultSpeedScale).toBe(1.1);
    expect(config.autoStart).toBe(true);
    expect(config.dataDir).toContain('voicevox-mcp');
  });

  it('環境変数による上書きを検証する', () => {
    const config = loadConfig({
      LOCALAPPDATA: 'C:\\temp',
      VOICEVOX_AUTO_START: 'false',
      VOICEVOX_ENGINE_URL: 'http://localhost:50100',
      VOICEVOX_SPEAKER_ID: '3',
      VOICEVOX_SPEED_SCALE: '1.25',
    });

    expect(config.endpoint.origin).toBe('http://localhost:50100');
    expect(config.autoStart).toBe(false);
    expect(config.defaultSpeakerId).toBe(3);
    expect(config.defaultSpeedScale).toBe(1.25);
  });

  it('不正なポートを設定エラーにする', () => {
    expect(() => loadConfig({ VOICEVOX_PORT: '70000' })).toThrowError(VoicevoxMcpError);
  });
});
