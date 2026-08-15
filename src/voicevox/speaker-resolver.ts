import { VoicevoxMcpError } from '../errors.js';
import type { VoiceSelection, VoicevoxSpeaker } from './types.js';

const CHARACTER_ALIASES = new Map<string, string>([['zundamon', 'ずんだもん']]);
const STYLE_ALIASES = new Map<string, string>([
  ['normal', 'ノーマル'],
  ['sweet', 'あまあま'],
  ['tsuntsun', 'ツンツン'],
  ['sexy', 'セクシー'],
  ['whisper', 'ささやき'],
]);

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ja-JP').replace(/[\s_\-/]+/gu, '');
}

function alias(value: string, aliases: Map<string, string>): string {
  return aliases.get(normalize(value)) ?? value;
}

export interface VoiceRequest {
  character: string;
  speakerId?: number;
  style: string;
}

export function resolveVoice(speakers: VoicevoxSpeaker[], request: VoiceRequest): VoiceSelection {
  if (request.speakerId !== undefined) {
    for (const speaker of speakers) {
      const style = speaker.styles.find((candidate) => candidate.id === request.speakerId);
      if (style !== undefined) {
        return { character: speaker.name, speakerId: style.id, style: style.name };
      }
    }
    throw new VoicevoxMcpError('VOICE_NOT_FOUND', `話者スタイルID ${String(request.speakerId)} は見つかりません。`, {
      guidance: 'list_voicesを呼び出し、利用可能なspeakerIdを確認してください。',
    });
  }

  const requestedCharacter = alias(request.character, CHARACTER_ALIASES);
  const speaker = speakers.find((candidate) => normalize(candidate.name) === normalize(requestedCharacter));
  if (speaker === undefined) {
    const names = speakers.map((candidate) => candidate.name).slice(0, 20).join('、');
    throw new VoicevoxMcpError('VOICE_NOT_FOUND', `キャラクター「${request.character}」は見つかりません。`, {
      guidance: `list_voicesで確認してください。現在の候補: ${names}`,
    });
  }

  const requestedStyle = alias(request.style, STYLE_ALIASES);
  const style = speaker.styles.find((candidate) => normalize(candidate.name) === normalize(requestedStyle));
  if (style === undefined) {
    throw new VoicevoxMcpError(
      'VOICE_NOT_FOUND',
      `${speaker.name}のスタイル「${request.style}」は見つかりません。`,
      { guidance: `利用可能なスタイル: ${speaker.styles.map((candidate) => candidate.name).join('、')}` },
    );
  }
  return { character: speaker.name, speakerId: style.id, style: style.name };
}
