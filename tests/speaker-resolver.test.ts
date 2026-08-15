import { describe, expect, it } from 'vitest';

import { VoicevoxMcpError } from '../src/errors.js';
import { resolveVoice } from '../src/voicevox/speaker-resolver.js';
import type { VoicevoxSpeaker } from '../src/voicevox/types.js';

const speakers: VoicevoxSpeaker[] = [
  {
    name: 'ずんだもん',
    speaker_uuid: 'test-zundamon',
    styles: [
      { id: 3, name: 'ノーマル' },
      { id: 1, name: 'あまあま' },
    ],
  },
  {
    name: '四国めたん',
    speaker_uuid: 'test-metan',
    styles: [{ id: 2, name: 'ノーマル' }],
  },
];

describe('resolveVoice', () => {
  it('既定の日本語名を解決する', () => {
    expect(resolveVoice(speakers, { character: 'ずんだもん', style: 'ノーマル' })).toEqual({
      character: 'ずんだもん',
      speakerId: 3,
      style: 'ノーマル',
    });
  });

  it('英語の別名を解決する', () => {
    expect(resolveVoice(speakers, { character: 'Zundamon', style: 'sweet' }).speakerId).toBe(1);
  });

  it('speakerIdを名前より優先する', () => {
    expect(resolveVoice(speakers, { character: 'unknown', speakerId: 2, style: 'unknown' })).toEqual({
      character: '四国めたん',
      speakerId: 2,
      style: 'ノーマル',
    });
  });

  it('存在しないスタイルで設定方法を返す', () => {
    expect(() => resolveVoice(speakers, { character: 'ずんだもん', style: '不明' })).toThrowError(
      VoicevoxMcpError,
    );
  });
});
